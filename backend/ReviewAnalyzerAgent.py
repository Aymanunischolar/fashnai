import logging
import uuid
import os
from textwrap import dedent
from typing import List, Dict
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


class SentimentScore(BaseModel):
    positive: int = Field(..., description="Positive sentiment percentage (0-100)")
    negative: int = Field(..., description="Negative sentiment percentage (0-100)")
    neutral: int = Field(..., description="Neutral sentiment percentage (0-100)")


class ReviewAnalysis(BaseModel):
    overall_rating: float = Field(..., description="Overall product rating (0-5 stars)")
    total_reviews: int = Field(..., description="Total number of reviews analyzed")
    sentiment: SentimentScore = Field(..., description="Sentiment distribution across reviews")
    pros: List[str] = Field(..., description="List of 3-5 main pros mentioned in reviews")
    cons: List[str] = Field(..., description="List of 3-5 main cons mentioned in reviews")
    common_themes: List[str] = Field(..., description="Common themes or topics mentioned in reviews")
    summary: str = Field(..., description="2-3 sentence summary of overall customer feedback")
    verified_purchase_percentage: int = Field(default=0, description="Percentage of verified purchase reviews")
    sources_analyzed: List[str] = Field(..., description="URLs of review sources analyzed")


def review_analyzer_agent(model_id: str | None = None) -> Agent:
    llm = create_llm(model_id or TEXT_MODEL_CANDIDATES[0])
    agent = Agent(
        name="Fashion Review Analyzer Agent",
        model=llm,
        tools=[
            SerperTools(),
            Crawl4aiTools(max_length=15000),
        ],
        tool_call_limit=15,
        description=dedent("""\
        You are an intelligent review analysis agent specialized in fashion products. 
        Your job is to find, analyze, and summarize customer reviews for fashion items 
        (clothing, shoes, accessories) from multiple sources to provide comprehensive 
        insights about product quality, fit, and customer satisfaction.
        """),
        instructions=dedent("""\
        You will receive a product URL or product name. Your task is to:
        
        1. Review Discovery Phase
            - Crawl the provided product URL to find customer reviews
            - Search for additional review sources using web search:
                * Product review sites
                * Fashion forums and communities
                * Social media mentions
                * Retailer websites with the same product
            - Collect at least 20-50 reviews if available
        
        2. Review Analysis Phase
            - Analyze sentiment of each review (positive/negative/neutral)
            - Calculate overall sentiment distribution
            - Identify common pros mentioned across reviews:
                * Quality aspects (material, construction, durability)
                * Fit and sizing (true to size, runs small/large)
                * Comfort and wearability
                * Style and appearance
                * Value for money
            - Identify common cons mentioned across reviews:
                * Quality issues
                * Sizing problems
                * Comfort concerns
                * Durability issues
                * Value concerns
        
        3. Theme Extraction
            - Identify recurring themes across reviews:
                * "Great quality but runs small"
                * "Comfortable for all-day wear"
                * "Color differs from photos"
                * "Worth the price"
            - Group similar feedback together
        
        4. Rating Calculation
            - Calculate overall rating from all reviews
            - Note the total number of reviews analyzed
            - Identify percentage of verified purchases
        
        5. Output Requirements
            - You MUST respond strictly in the JSON schema defined by the ReviewAnalysis model
            - Provide 3-5 specific pros (not generic statements)
            - Provide 3-5 specific cons (not generic statements)
            - Include common themes that appear in multiple reviews
            - Write a concise 2-3 sentence summary
            - List all review sources (URLs) you analyzed
            - If insufficient reviews found, note this in the summary
        
        6. Quality Guidelines
            - Focus on substantive reviews (ignore spam or very short reviews)
            - Prioritize verified purchase reviews
            - Look for specific details rather than generic praise/complaints
            - Balance positive and negative feedback objectively
        """),
        output_schema=ReviewAnalysis,
        db=SqliteDb(session_table="review_analyzer_agent", db_file="/tmp/agents.db"),
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


def analyze_reviews(product_url: str, max_retries: int = 3) -> RunOutput:
    payload = dedent(f"""
        product_url: {product_url}
        
        Please analyze customer reviews for this fashion product from multiple sources.
    """)

    last_response = None

    for model_id in TEXT_MODEL_CANDIDATES:
        agent = review_analyzer_agent(model_id)
        for attempt in range(1, max_retries + 1):
            response = agent.run(input=payload, session_id=str(uuid.uuid4()))
            last_response = response
            try:
                _ = ReviewAnalysis.model_validate(response.content)
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

    raise RuntimeError("No Gemini model candidates were available for review analysis")


if __name__ == "__main__":
    test_url = "https://en.zalando.de/bershka-baby-gifts-black-bej22s0jx-q11.html"
    result = analyze_reviews(test_url)
    print("\n" + "="*80)
    print("REVIEW ANALYSIS RESULTS")
    print("="*80)
    print(result.content)
