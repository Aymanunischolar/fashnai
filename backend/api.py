from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from contextlib import asynccontextmanager
import asyncio
import logging

from PriceAgent import compare_prices, PriceComparisonResult
from ReviewAnalyzerAgent import analyze_reviews, ReviewAnalysis
from ProductSpecsAgent import extract_specifications, ProductSpecification
from VirtualTryOnAgent import virtual_tryon, VirtualTryOnResult

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("FashnAI API starting with paid Gemini API key")
    logger.info("Rate limit capacity: 1000+ requests/minute (paid tier)")
    logger.info("Using SQLite database (automatic, no configuration needed)")
    
    yield
    # Shutdown
    logger.info("FashnAI API shutting down")

app = FastAPI(
    title="FashnAI Fashion Comparison API",
    description="AI-powered fashion product comparison and analysis",
    version="1.0.0",
    lifespan=lifespan
)

# Get frontend URL from environment or use localhost for development
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    product_url: str


class CachedProductSpecs(BaseModel):
    product_name: str
    brand: str
    category: str
    color: str
    material: str
    sizes_available: list[str] = []
    care_instructions: Optional[str] = None
    features: list[str] = []
    fit_type: Optional[str] = None

class VirtualTryOnRequest(BaseModel):
    product_url: str
    user_size: Optional[str] = None
    user_height: Optional[str] = None
    user_body_type: Optional[str] = None
    user_image_base64: Optional[str] = None  # Base64 encoded user photo for personalized analysis
    product_specs: Optional[CachedProductSpecs] = None  # Pre-fetched product specs to avoid re-crawling


class ProductAnalysisResponse(BaseModel):
    prices: PriceComparisonResult
    reviews: ReviewAnalysis
    specifications: ProductSpecification
    status: str = "success"


@app.get("/")
def root():
    return {
        "message": "FashnAI Fashion Comparison API",
        "version": "1.0.0",
        "api_tier": "Paid",
        "rate_limit": "1000+ requests/minute",
        "execution": "Parallel (3 agents)",
        "endpoints": {
            "health": "/health",
            "search": "/api/search (POST)",
            "prices": "/api/prices (POST)",
            "reviews": "/api/reviews (POST)",
            "specs": "/api/specs (POST)",
            "virtual_tryon": "/api/virtual-tryon (POST)"
        }
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy", 
        "service": "FashnAI API",
        "model": "gemini-2.5-flash-lite",
        "model_candidates": [
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash",
            "gemini-2.5-pro"
        ]
    }


@app.post("/api/search", response_model=ProductAnalysisResponse)
async def search_product(request: SearchRequest):
    """
    Comprehensive product analysis - prices, reviews, and specifications
    """
    try:
        logger.info(f"Starting comprehensive analysis for: {request.product_url}")
        
        # Run agents in PARALLEL with single paid API key
        logger.info("Running all 3 agents in parallel with paid API key...")
        
        # Create tasks for parallel execution
        price_task = asyncio.create_task(asyncio.to_thread(compare_prices, request.product_url))
        review_task = asyncio.create_task(asyncio.to_thread(analyze_reviews, request.product_url))
        specs_task = asyncio.create_task(asyncio.to_thread(extract_specifications, request.product_url))
        
        # Wait for all to complete
        results = await asyncio.gather(price_task, review_task, specs_task, return_exceptions=True)
        
        # Process price result
        if isinstance(results[0], Exception):
            logger.error(f"PriceAgent failed: {str(results[0])}")
            price_data = PriceComparisonResult(
                original_product_name="Unknown",
                original_product_url=request.product_url,
                product_listings=[],
                search_summary=f"Price comparison unavailable: {str(results[0])}",
                sources_checked=[]
            )
        elif isinstance(results[0].content, str):
            logger.warning(f"PriceAgent returned error: {results[0].content[:200]}")
            price_data = PriceComparisonResult(
                original_product_name="Unknown",
                original_product_url=request.product_url,
                product_listings=[],
                search_summary="Price comparison unavailable due to API error.",
                sources_checked=[]
            )
        else:
            price_data = results[0].content
        
        # Process review result
        if isinstance(results[1], Exception):
            logger.error(f"ReviewAnalyzerAgent failed: {str(results[1])}")
            review_data = ReviewAnalysis(
                overall_rating=0.0,
                total_reviews=0,
                sentiment={"positive": 0, "negative": 0, "neutral": 0},
                pros=[],
                cons=[],
                common_themes=[],
                summary=f"Review analysis unavailable: {str(results[1])}",
                verified_purchase_percentage=0,
                sources_analyzed=[]
            )
        elif isinstance(results[1].content, str):
            logger.warning(f"ReviewAnalyzerAgent returned error: {results[1].content[:200]}")
            review_data = ReviewAnalysis(
                overall_rating=0.0,
                total_reviews=0,
                sentiment={"positive": 0, "negative": 0, "neutral": 0},
                pros=[],
                cons=[],
                common_themes=[],
                summary="Review analysis unavailable due to API error.",
                verified_purchase_percentage=0,
                sources_analyzed=[]
            )
        else:
            review_data = results[1].content
        
        # Process specs result
        if isinstance(results[2], Exception):
            logger.error(f"ProductSpecsAgent failed: {str(results[2])}")
            specs_data = ProductSpecification(
                product_name="Unknown",
                brand="Unknown",
                category="Unknown",
                color="Unknown",
                material="Unknown",
                sizes_available=[],
                care_instructions=None,
                features=[],
                dimensions=None,
                weight=None,
                style_number=None,
                country_of_origin=None,
                sustainability=None,
                fit_type=None,
                additional_specs={},
                sources=[]
            )
        elif isinstance(results[2].content, str):
            logger.warning(f"ProductSpecsAgent returned error: {results[2].content[:200]}")
            specs_data = ProductSpecification(
                product_name="Unknown",
                brand="Unknown",
                category="Unknown",
                color="Unknown",
                material="Unknown",
                sizes_available=[],
                care_instructions=None,
                features=[],
                dimensions=None,
                weight=None,
                style_number=None,
                country_of_origin=None,
                sustainability=None,
                fit_type=None,
                additional_specs={},
                sources=[]
            )
        else:
            specs_data = results[2].content
        
        return ProductAnalysisResponse(
            prices=price_data,
            reviews=review_data,
            specifications=specs_data,
            status="success"
        )
    
    except Exception as e:
        logger.error(f"Error in comprehensive analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/api/prices", response_model=PriceComparisonResult)
async def get_prices(request: SearchRequest):
    """
    Get price comparison across multiple retailers
    """
    try:
        logger.info(f"Fetching prices for: {request.product_url}")
        result = await asyncio.to_thread(compare_prices, request.product_url)
        if isinstance(result.content, str):
            # Agent returned error string instead of model
            return PriceComparisonResult(
                original_product_name="Unknown",
                original_product_url=request.product_url,
                product_listings=[],
                search_summary=f"Error: {result.content}",
                sources_checked=[]
            )
        return result.content
    except Exception as e:
        logger.error(f"Error fetching prices: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Price fetch failed: {str(e)}")


@app.post("/api/reviews", response_model=ReviewAnalysis)
async def get_reviews(request: SearchRequest):
    """
    Get review analysis and sentiment
    """
    try:
        logger.info(f"Analyzing reviews for: {request.product_url}")
        result = await asyncio.to_thread(analyze_reviews, request.product_url)
        if isinstance(result.content, str):
            # Agent returned error string instead of model
            return ReviewAnalysis(
                overall_rating=0.0,
                total_reviews=0,
                sentiment={"positive": 0, "negative": 0, "neutral": 0},
                pros=[],
                cons=[],
                common_themes=[],
                summary=f"Error: {result.content}",
                verified_purchase_percentage=0,
                sources_analyzed=[]
            )
        return result.content
    except Exception as e:
        logger.error(f"Error analyzing reviews: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Review analysis failed: {str(e)}")


@app.post("/api/specs", response_model=ProductSpecification)
async def get_specifications(request: SearchRequest):
    """
    Get product specifications
    """
    try:
        logger.info(f"Extracting specifications for: {request.product_url}")
        result = await asyncio.to_thread(extract_specifications, request.product_url)
        if isinstance(result.content, str):
            # Agent returned error string instead of model
            return ProductSpecification(
                product_name="Unknown",
                brand="Unknown",
                category="Unknown",
                color="Unknown",
                material="Unknown",
                sizes_available=[],
                care_instructions=None,
                features=[],
                dimensions=None,
                weight=None,
                style_number=None,
                country_of_origin=None,
                sustainability=None,
                fit_type=None,
                additional_specs={},
                sources=[]
            )
        return result.content
    except Exception as e:
        logger.error(f"Error extracting specifications: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Specification extraction failed: {str(e)}")


@app.post("/api/virtual-tryon", response_model=VirtualTryOnResult)
async def virtual_tryon_endpoint(request: VirtualTryOnRequest):
    """
    Virtual try-on analysis for fashion products
    """
    try:
        logger.info(f"Starting virtual try-on for: {request.product_url}")
        # Convert product_specs to dict if provided
        product_specs_dict = request.product_specs.model_dump() if request.product_specs else None

        result = await asyncio.to_thread(
            virtual_tryon,
            request.product_url,
            request.user_size,
            request.user_height,
            request.user_body_type,
            request.user_image_base64,
            product_specs_dict
        )
        if isinstance(result.content, str):
            # Agent returned error string instead of model
            return VirtualTryOnResult(
                generated_image_description="Virtual try-on unavailable",
                fit_analysis=f"Error: {result.content}",
                style_recommendations=[],
                confidence_score=0.0,
                size_recommendation="Unable to determine",
                product_name="Unknown",
                warnings=["Service temporarily unavailable"]
            )
        return result.content
    except Exception as e:
        logger.error(f"Error in virtual try-on: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Virtual try-on failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
