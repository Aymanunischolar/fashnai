import logging
import uuid
import os
import base64
import io
from textwrap import dedent
from typing import Optional
from agno.agent import Agent, RunOutput
from agno.models.google import Gemini
from agno.db.sqlite import SqliteDb
from agno.tools.crawl4ai import Crawl4aiTools
from agno.media import Image
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from PIL import Image as PILImage

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter(
    "%(asctime)s %(levelname)s [%(name)s] %(message)s"
))
logger.addHandler(handler)

load_dotenv()

TEXT_MODEL_CANDIDATES = []
for candidate in [
    os.getenv("GOOGLE_GEMINI_MODEL", "gemini-2.5-flash-lite"),
    "gemini-2.5-flash",
    "gemini-2.5-pro",
]:
    if candidate not in TEXT_MODEL_CANDIDATES:
        TEXT_MODEL_CANDIDATES.append(candidate)


def create_llm(model_id: str) -> Gemini:
    return Gemini(
        id=model_id,
        api_key=os.getenv("GOOGLE_API_KEY"),
        vertexai=False
    )


class VirtualTryOnResult(BaseModel):
    generated_image_description: str = Field(
        ..., description="Detailed description of how the garment looks on the user")
    fit_analysis: str = Field(
        ..., description="Analysis of how the garment fits the user's body type")
    style_recommendations: list[str] = Field(
        ..., description="Styling recommendations for the outfit")
    confidence_score: float = Field(
        ..., description="Confidence score of the virtual try-on (0.0 to 1.0)")
    size_recommendation: str = Field(
        ..., description="Recommended size based on user's body and garment specifications")
    product_name: str = Field(
        ..., description="Name of the product being tried on")
    warnings: list[str] = Field(
        default_factory=list, description="Any warnings about fit, style, or compatibility")
    generated_image_base64: Optional[str] = Field(
        default=None, description="Base64 encoded generated image of the user wearing the outfit")


def generate_tryon_image(
    user_image_bytes: bytes,
    product_specs: Optional[dict] = None,
    product_name: str = "the outfit"
) -> Optional[str]:
    """
    Generate a virtual try-on image using Gemini's image generation.

    Args:
        user_image_bytes: The user's photo as bytes
        product_specs: Product specifications dict
        product_name: Name of the product

    Returns:
        Base64 encoded generated image, or None if generation fails
    """
    try:
        client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

        # Open the user's image
        user_image = PILImage.open(io.BytesIO(user_image_bytes))

        # Build the prompt for image generation
        if product_specs:
            product_description = f"""
            Product: {product_specs.get('product_name', product_name)}
            Brand: {product_specs.get('brand', 'Unknown')}
            Color: {product_specs.get('color', 'Unknown')}
            Material: {product_specs.get('material', 'Unknown')}
            Category: {product_specs.get('category', 'clothing')}
            Fit Type: {product_specs.get('fit_type', 'regular')}
            """
        else:
            product_description = f"Product: {product_name}"

        prompt = f"""Generate a realistic image of this person wearing the following clothing item:

{product_description}

Instructions:
- Keep the person's face, body shape, and proportions exactly the same
- Replace or add the clothing item described above
- Make it look natural and realistic as if they are actually wearing the outfit
- Maintain the same background and lighting style
- The clothing should fit naturally on their body
"""

        logger.info(f"Generating try-on image with Gemini...")

        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[prompt, user_image],
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE', 'TEXT']
            )
        )

        # Extract the generated image
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                # Convert to base64
                image_base64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                logger.info("Successfully generated try-on image")
                return f"data:image/png;base64,{image_base64}"

        logger.warning("No image generated in response")
        return None

    except Exception as e:
        logger.error(f"Failed to generate try-on image: {e}")
        return None


def virtual_tryon_agent(model_id: str | None = None) -> Agent:
    llm = create_llm(model_id or TEXT_MODEL_CANDIDATES[0])
    agent = Agent(
        name="Virtual Try-On AI Agent",
        model=llm,
        tools=[
            Crawl4aiTools(max_length=10000),
        ],
        tool_call_limit=10,
        description=dedent("""\
        You are an advanced AI fashion stylist and virtual try-on specialist.
        Your role is to analyze fashion products and user characteristics to provide
        realistic virtual try-on insights, fit analysis, and styling recommendations.
        """),
        instructions=dedent("""\
        You will receive a product URL and user characteristics. Your task is to:

        1. Product Analysis Phase
            - Crawl the product URL to extract:
                * Product name, brand, and category
                * Size information and fit type
                * Material and fabric details
                * Design features (cut, style, pattern)
                * Model measurements if shown
                * Available colors and sizes

        2. Virtual Try-On Simulation
            - Based on product details and user characteristics:
                * Describe how the garment would look on the user
                * Consider body type, proportions, and the garment's cut
                * Visualize how the fabric would drape
                * Consider color compatibility with skin tone (if provided)
                * Imagine the overall silhouette and fit

        3. Fit Analysis
            - Analyze how the garment would fit:
                * Consider garment size vs user measurements
                * Note if it would be tight, loose, or just right
                * Identify potential fit issues (e.g., too long, shoulders too wide)
                * Consider the intended fit type (slim, regular, oversized)

        4. Size Recommendation
            - Recommend the best size based on:
                * User's typical size or measurements
                * Brand's sizing standards
                * Garment's fit type
                * User preferences (fitted vs relaxed)

        5. Styling Recommendations
            - Provide 3-5 specific styling suggestions:
                * What to pair it with (e.g., "Pair with high-waisted jeans")
                * Occasion suitability
                * Footwear recommendations
                * Accessory suggestions
                * Color coordination tips

        6. Warnings & Considerations
            - Note any potential issues:
                * "May run small, consider sizing up"
                * "Delicate material, requires careful handling"
                * "Best suited for specific body types"
                * "Color may appear different in person"

        7. Confidence Assessment
            - Assign a confidence score (0.0-1.0) based on:
                * Completeness of product information
                * Clarity of sizing information
                * Availability of model photos and measurements
                * Specificity of user characteristics provided

        8. Output Requirements
            - You MUST respond in the JSON schema defined by VirtualTryOnResult
            - Be specific and realistic in your descriptions
            - Base recommendations on actual product details
            - Provide actionable styling advice
            - Include honest warnings about potential issues
        """),
        output_schema=VirtualTryOnResult,
        db=SqliteDb(session_table="virtual_tryon_agent", db_file="/tmp/agents.db"),
        add_datetime_to_context=True,
        use_json_mode=True,
    )
    return agent


def _is_transient_model_error(message: str) -> bool:
    lowered = message.lower()
    return any(
        phrase in lowered
        for phrase in (
            "high demand",
            "temporarily unavailable",
            "service unavailable",
            "not available",
            "unavailable",
            "try again later",
            "resource_exhausted",
            "quota exceeded",
        )
    )


def virtual_tryon(
    product_url: str,
    user_size: Optional[str] = None,
    user_height: Optional[str] = None,
    user_body_type: Optional[str] = None,
    user_image_base64: Optional[str] = None,
    product_specs: Optional[dict] = None,
    max_retries: int = 3
) -> RunOutput:
    """
    Perform virtual try-on analysis for a fashion product.

    Args:
        product_url: URL of the fashion product
        user_size: User's typical size (e.g., "M", "L", "32", "8")
        user_height: User's height (e.g., "5'8\"", "173cm")
        user_body_type: User's body type description (e.g., "athletic", "curvy", "slim")
        user_image_base64: Base64 encoded user photo for personalized analysis
        product_specs: Pre-fetched product specifications (to avoid re-crawling)
        max_retries: Maximum number of retry attempts

    Returns:
        RunOutput containing VirtualTryOnResult
    """

    # Build user characteristics string
    user_info = []
    if user_size:
        user_info.append(f"Typical size: {user_size}")
    if user_height:
        user_info.append(f"Height: {user_height}")
    if user_body_type:
        user_info.append(f"Body type: {user_body_type}")

    user_characteristics = "\n".join(user_info) if user_info else "No specific user characteristics provided"

    # Build image analysis instructions
    image_instructions = ""
    if user_image_base64:
        image_instructions = dedent("""

        IMPORTANT: A user photo has been provided as a base64 encoded image.
        Analyze the user's photo to determine:
        - Body shape and proportions
        - Approximate body type (slim, athletic, average, curvy, plus-size)
        - Skin tone (for color recommendations)
        - Current style preferences visible in the photo

        Use these visual observations along with any provided user characteristics
        to give highly personalized fit analysis and styling recommendations.
        """)

    # Build product info section - use cached specs if available
    if product_specs:
        logger.info("Using cached product specifications (skipping crawl)")
        product_info = dedent(f"""
        PRODUCT INFORMATION (pre-fetched, no need to crawl):
        - Product Name: {product_specs.get('product_name', 'Unknown')}
        - Brand: {product_specs.get('brand', 'Unknown')}
        - Category: {product_specs.get('category', 'Unknown')}
        - Color: {product_specs.get('color', 'Unknown')}
        - Material: {product_specs.get('material', 'Unknown')}
        - Available Sizes: {', '.join(product_specs.get('sizes_available', [])) or 'Unknown'}
        - Fit Type: {product_specs.get('fit_type', 'Not specified')}
        - Features: {', '.join(product_specs.get('features', [])) or 'None listed'}
        - Care Instructions: {product_specs.get('care_instructions', 'Not specified')}

        DO NOT crawl the product URL - use the information above for your analysis.
        """)
    else:
        logger.info("No cached specs - agent will crawl the product URL")
        product_info = f"Product URL: {product_url}\n\nPlease crawl this URL to get product details."

    payload = dedent(f"""
        {product_info}

        User Characteristics:
        {user_characteristics}
        {image_instructions}
        Please perform a virtual try-on analysis for this product, providing detailed
        insights about how it would look on a user with these characteristics.
    """)

    # Build images list if user provided an image
    images = None
    user_image_bytes = None  # Store for image generation
    if user_image_base64:
        try:
            # Clean the base64 string and extract mime type
            mime_type = "image/jpeg"  # default
            raw_base64 = user_image_base64
            if user_image_base64.startswith("data:"):
                # Extract mime type from data URL (e.g., "data:image/png;base64,...")
                header, base64_data = user_image_base64.split(",", 1)
                if "image/png" in header:
                    mime_type = "image/png"
                elif "image/gif" in header:
                    mime_type = "image/gif"
                elif "image/webp" in header:
                    mime_type = "image/webp"
                raw_base64 = base64_data

            # Decode and create Image object
            user_image_bytes = base64.b64decode(raw_base64)
            images = [Image(content=user_image_bytes, mime_type=mime_type)]
            logger.info(f"User image included in analysis (mime_type: {mime_type})")
        except Exception as e:
            logger.warning(f"Failed to decode user image: {e}")
            images = None
            user_image_bytes = None

    last_response = None

    for model_id in TEXT_MODEL_CANDIDATES:
        agent = virtual_tryon_agent(model_id)
        for attempt in range(1, max_retries + 1):
            response = agent.run(input=payload, session_id=str(uuid.uuid4()), images=images)
            last_response = response
            try:
                result = VirtualTryOnResult.model_validate(response.content)

                # Generate try-on image if user provided a photo
                if user_image_bytes:
                    logger.info("Generating virtual try-on image...")
                    generated_image = generate_tryon_image(
                        user_image_bytes=user_image_bytes,
                        product_specs=product_specs,
                        product_name=result.product_name
                    )
                    if generated_image:
                        result.generated_image_base64 = generated_image
                        # Update the response content with the new result
                        response.content = result

                return response
            except Exception as e:
                response_text = response.content if isinstance(response.content, str) else str(e)
                if _is_transient_model_error(response_text):
                    logger.error(f"Model {model_id} hit a transient provider error: {response_text[:200]}")
                    break
                if attempt < max_retries:
                    logger.error(f"Attempt {attempt} failed: {e}. Retrying...")
                    continue
                logger.error(f"All {max_retries} attempts failed for model {model_id}.")
                break

    if last_response is not None:
        logger.error("All model candidates failed. Returning last response.")
        return last_response

    raise RuntimeError("No Gemini model candidates were available for virtual try-on")


if __name__ == "__main__":
    test_url = "https://en.zalando.de/bershka-baby-gifts-black-bej22s0jx-q11.html"
    result = virtual_tryon(
        product_url=test_url,
        user_size="M",
        user_height="5'9\"",
        user_body_type="athletic"
    )
    print("\n" + "="*80)
    print("VIRTUAL TRY-ON RESULTS")
    print("="*80)
    print(result.content)
