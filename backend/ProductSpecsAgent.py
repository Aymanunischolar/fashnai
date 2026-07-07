import logging
import uuid
import os
from textwrap import dedent
from typing import List, Optional, Dict
from agno.agent import Agent, RunOutput
from agno.models.google import Gemini
from agno.db.sqlite import SqliteDb
from agno.tools.serper import SerperTools
from agno.tools.crawl4ai import Crawl4aiTools
from dotenv import load_dotenv
from pydantic import BaseModel, Field

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


class ProductSpecification(BaseModel):
    product_name: str = Field(..., description="Full product name/title")
    brand: str = Field(..., description="Brand name")
    category: str = Field(..., description="Product category (e.g., Sneakers, Dress, Jacket)")
    color: str = Field(..., description="Color or colorway")
    material: str = Field(..., description="Primary material or fabric composition")
    sizes_available: List[str] = Field(..., description="List of available sizes")
    care_instructions: Optional[str] = Field(None, description="Care and washing instructions")
    features: List[str] = Field(..., description="Key product features (3-7 items)")
    dimensions: Optional[Dict[str, str]] = Field(None, description="Product dimensions if applicable")
    weight: Optional[str] = Field(None, description="Product weight if applicable")
    style_number: Optional[str] = Field(None, description="Style number, SKU, or product code")
    country_of_origin: Optional[str] = Field(None, description="Manufacturing country")
    sustainability: Optional[str] = Field(None, description="Sustainability or eco-friendly information")
    fit_type: Optional[str] = Field(None, description="Fit type (e.g., Regular Fit, Slim Fit, Oversized)")
    additional_specs: Dict[str, str] = Field(default_factory=dict, description="Any additional specifications")
    sources: List[str] = Field(..., description="URLs where specifications were found")


def product_specs_agent(model_id: str | None = None) -> Agent:
    llm = create_llm(model_id or TEXT_MODEL_CANDIDATES[0])
    agent = Agent(
        name="Fashion Product Specifications Agent",
        model=llm,
        tools=[
            SerperTools(),
            Crawl4aiTools(max_length=15000),
        ],
        tool_call_limit=15,
        description=dedent("""\
        You are an intelligent product specifications extraction agent specialized in fashion products. 
        Your job is to extract comprehensive, accurate product specifications from fashion e-commerce 
        websites including materials, sizes, care instructions, and technical details.
        """),
        instructions=dedent("""\
        You will receive a product URL. Your task is to:
        
        1. Product Information Extraction Phase
            - Crawl the provided product URL thoroughly
            - Extract basic information:
                * Full product name/title
                * Brand name
                * Product category (Sneakers, Dress, Jacket, Jeans, etc.)
                * Color/colorway
                * Style number or SKU
            
        2. Material & Construction Details
            - Extract material composition:
                * Primary materials (e.g., 100% Cotton, Leather, Polyester blend)
                * Fabric type (e.g., Denim, Jersey, Canvas)
                * Special treatments or finishes
            - Construction details:
                * Stitching type
                * Closure type (zipper, buttons, laces)
                * Lining information
        
        3. Sizing Information
            - List all available sizes (XS, S, M, L, XL, or numeric sizes)
            - Note fit type (Regular Fit, Slim Fit, Oversized, etc.)
            - Extract size chart information if available
            - Note any sizing recommendations
        
        4. Care Instructions
            - Washing instructions
            - Drying instructions
            - Ironing guidelines
            - Special care notes
        
        5. Product Features
            - Extract 3-7 key features:
                * Functional features (pockets, adjustable straps, etc.)
                * Design features (patterns, embellishments, etc.)
                * Performance features (waterproof, breathable, etc.)
                * Comfort features (cushioned, stretchy, etc.)
        
        6. Additional Specifications
            - Dimensions (length, width, height for bags/accessories)
            - Weight (if provided)
            - Country of origin/manufacturing
            - Sustainability information (recycled materials, eco-friendly, etc.)
            - Certifications (OEKO-TEX, Fair Trade, etc.)
        
        7. Search for Additional Information
            - If specifications are incomplete on the product page:
                * Search for the product on brand's official website
                * Search for product reviews that mention specifications
                * Search for retailer descriptions
            - Use search queries like:
                * "[Brand] [Product Name] specifications"
                * "[Product Name] material composition"
                * "[Product Name] care instructions"
        
        8. Output Requirements
            - You MUST respond strictly in the JSON schema defined by the ProductSpecification model
            - Provide accurate, specific information (not generic descriptions)
            - If information is not found, use null for optional fields
            - List all sources (URLs) where you found specifications
            - Ensure sizes_available is a list of actual sizes, not descriptions
            - Features should be concise bullet points
        
        9. Quality Guidelines
            - Prioritize official product information from brand/retailer
            - Cross-reference information from multiple sources when possible
            - Be specific: "100% Organic Cotton" not just "Cotton"
            - Include technical details when available
        """),
        output_schema=ProductSpecification,
        db=SqliteDb(session_table="product_specs_agent", db_file="tmp/agents.db"),
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


def extract_specifications(product_url: str, max_retries: int = 3) -> RunOutput:
    payload = dedent(f"""
        product_url: {product_url}
        
        Please extract comprehensive product specifications for this fashion product.
    """)

    last_response = None

    for model_id in TEXT_MODEL_CANDIDATES:
        agent = product_specs_agent(model_id)
        for attempt in range(1, max_retries + 1):
            response = agent.run(input=payload, session_id=str(uuid.uuid4()))
            last_response = response
            try:
                _ = ProductSpecification.model_validate(response.content)
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

    raise RuntimeError("No Gemini model candidates were available for specification extraction")


if __name__ == "__main__":
    test_url = "https://en.zalando.de/bershka-baby-gifts-black-bej22s0jx-q11.html"
    result = extract_specifications(test_url)
    print("\n" + "="*80)
    print("PRODUCT SPECIFICATIONS")
    print("="*80)
    print(result.content)
