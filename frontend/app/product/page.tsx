'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, Star, TrendingUp, TrendingDown, Package, ShoppingBag } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
interface ProductListing {
  website_name: string;
  product_url: string;
  price: string;
  availability: string;
  seller_info: string;
}

interface PriceComparison {
  original_product_name: string;
  original_product_url: string;
  product_listings: ProductListing[];
  search_summary: string;
  sources_checked: string[];
}

interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
}

interface ReviewAnalysis {
  overall_rating: number;
  total_reviews: number;
  sentiment: SentimentScore;
  pros: string[];
  cons: string[];
  common_themes: string[];
  summary: string;
  verified_purchase_percentage: number;
  sources_analyzed: string[];
}

interface ProductSpecification {
  product_name: string;
  brand: string;
  category: string;
  color: string;
  material: string;
  sizes_available: string[];
  care_instructions: string | null;
  features: string[];
  dimensions: Record<string, string> | null;
  weight: string | null;
  style_number: string | null;
  country_of_origin: string | null;
  sustainability: string | null;
  fit_type: string | null;
  additional_specs: Record<string, string>;
  sources: string[];
}

interface ProductData {
  prices: PriceComparison;
  reviews: ReviewAnalysis;
  specifications: ProductSpecification;
  status: string;
}

type AnalysisStep = 'prices' | 'reviews' | 'specs' | 'completed';

function ProductDetailsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'prices' | 'reviews' | 'specs'>('prices');
  const [currentStep, setCurrentStep] = useState<AnalysisStep>('prices');

  useEffect(() => {
    const fetchProductData = async () => {
      try {
        const productUrl = searchParams.get('url');
        if (!productUrl) {
          setError('No product URL provided');
          setLoading(false);
          return;
        }

        console.log('Starting analysis for:', productUrl);
        setLoading(true);
        setError(null);

        // 1. Price Agent
        setCurrentStep('prices');
        console.log('Step 1: Fetching prices...');
        const pricesResponse = await axios.post(`${API_URL}/api/prices`, {
          product_url: productUrl
        });
        const prices = pricesResponse.data;
        console.log('Prices received');

        // Wait 5 seconds between API calls to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 2. Review Agent
        setCurrentStep('reviews');
        console.log('Step 2: Analyzing reviews...');
        const reviewsResponse = await axios.post(`${API_URL}/api/reviews`, {
          product_url: productUrl
        });
        const reviews = reviewsResponse.data;
        console.log('Reviews received');

        // Wait 5 seconds between API calls to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 3. Specs Agent
        setCurrentStep('specs');
        console.log('Step 3: Extracting specifications...');
        const specsResponse = await axios.post(`${API_URL}/api/specs`, {
          product_url: productUrl
        });
        const specifications = specsResponse.data;
        console.log('Specifications received');

        setProductData({
          prices,
          reviews,
          specifications,
          status: 'success'
        });
        setCurrentStep('completed');
        console.log('Analysis completed successfully');
      } catch (err: any) {
        console.error('Error during analysis:', err);
        setError(err.response?.data?.detail || err.message || 'Failed to fetch product data');
      } finally {
        setLoading(false);
      }
    };

    fetchProductData();
  }, [searchParams]);

  if (loading) {
    const steps = [
      { id: 'prices', label: 'Comparing Prices', icon: ShoppingBag },
      { id: 'reviews', label: 'Analyzing Reviews', icon: Star },
      { id: 'specs', label: 'Extracting Specifications', icon: Package },
    ];

    const currentStepIndex = steps.findIndex(s => s.id === currentStep);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="max-w-md w-full px-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-gray-900">AI Research in Progress</h2>
            <p className="text-gray-600 mt-2">Our agents are scanning multiple fashion sources...</p>
          </div>
          
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isCompleted = index < currentStepIndex || currentStep === 'completed';
              const isCurrent = index === currentStepIndex && currentStep !== 'completed';
              
              return (
                <div 
                  key={step.id} 
                  className={`flex items-center p-4 rounded-xl transition-all duration-500 ${
                    isCurrent ? 'bg-white shadow-md scale-105 border-l-4 border-blue-600' : 
                    isCompleted ? 'bg-blue-50 opacity-80' : 'bg-gray-50 opacity-40'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${
                    isCurrent ? 'bg-blue-600 text-white animate-pulse' : 
                    isCompleted ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-400'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${
                        isCurrent ? 'text-blue-600' : 
                        isCompleted ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {step.label}
                      </span>
                      {isCompleted && <span className="text-green-600 text-sm font-bold">Done</span>}
                      {isCurrent && <span className="text-blue-600 text-sm animate-pulse">Running...</span>}
                    </div>
                    {isCurrent && (
                      <div className="mt-2 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 animate-progress"></div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">
            This typically takes 30-60 seconds to stay within API rate limits.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  if (!productData) return null;

  const { prices, reviews, specifications } = productData;
  
  // Safely calculate lowest price
  let lowestPrice = 0;
  try {
    if (prices?.product_listings?.length > 0) {
      const numericPrices = prices.product_listings
        .map(p => {
          const cleaned = p.price.replace(/[^0-9.]/g, '');
          const parsed = parseFloat(cleaned);
          return isNaN(parsed) ? Infinity : parsed;
        })
        .filter(p => p !== Infinity);
      
      if (numericPrices.length > 0) {
        lowestPrice = Math.min(...numericPrices);
      }
    }
  } catch (e) {
    console.error('Error calculating lowest price:', e);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Search</span>
            </button>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">F</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                FashnAI
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Product Header */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {specifications.product_name}
              </h1>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className="font-semibold">{specifications.brand}</span>
                <span>•</span>
                <span>{specifications.category}</span>
                <span>•</span>
                <span>{specifications.color}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Best Price</div>
              <div className="text-3xl font-bold text-green-600">
                {lowestPrice > 0 ? `€${lowestPrice.toFixed(2)}` : 'N/A'}
              </div>
              <div className="flex items-center justify-end mt-2">
                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                <span className="ml-1 font-semibold">{reviews.overall_rating.toFixed(1)}</span>
                <span className="ml-1 text-sm text-gray-500">({reviews.total_reviews} reviews)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-lg mb-6">
          <div className="border-b">
            <div className="flex space-x-8 px-8">
              <button
                onClick={() => setActiveTab('prices')}
                className={`py-4 px-2 border-b-2 font-semibold transition-colors ${
                  activeTab === 'prices'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <ShoppingBag className="w-5 h-5" />
                  <span>Price Comparison</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('reviews')}
                className={`py-4 px-2 border-b-2 font-semibold transition-colors ${
                  activeTab === 'reviews'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Star className="w-5 h-5" />
                  <span>Reviews</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('specs')}
                className={`py-4 px-2 border-b-2 font-semibold transition-colors ${
                  activeTab === 'specs'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Package className="w-5 h-5" />
                  <span>Specifications</span>
                </div>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {activeTab === 'prices' && (
              <div>
                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-2">Price Comparison</h3>
                  <p className="text-gray-600">{prices.search_summary}</p>
                </div>

                <div className="space-y-4">
                  {prices.product_listings.map((listing, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-6 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-1">{listing.website_name}</h4>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span className={`font-semibold ${
                            listing.availability.toLowerCase().includes('stock') 
                              ? 'text-green-600' 
                              : 'text-red-600'
                          }`}>
                            {listing.availability}
                          </span>
                          {listing.seller_info !== 'Not specified' && (
                            <>
                              <span>•</span>
                              <span>{listing.seller_info}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{listing.price}</div>
                          {index === 0 && (
                            <div className="text-xs text-green-600 font-semibold">Best Price</div>
                          )}
                        </div>
                        <a
                          href={listing.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                        >
                          <span>Visit Store</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div>
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  {/* Sentiment Analysis */}
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6">
                    <h3 className="text-lg font-bold mb-4">Sentiment Analysis</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-green-700">Positive</span>
                          <span className="text-sm font-bold">{reviews.sentiment.positive}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${reviews.sentiment.positive}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700">Neutral</span>
                          <span className="text-sm font-bold">{reviews.sentiment.neutral}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gray-400 h-2 rounded-full"
                            style={{ width: `${reviews.sentiment.neutral}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-red-700">Negative</span>
                          <span className="text-sm font-bold">{reviews.sentiment.negative}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-500 h-2 rounded-full"
                            style={{ width: `${reviews.sentiment.negative}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Review Stats */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6">
                    <h3 className="text-lg font-bold mb-4">Review Statistics</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Overall Rating</span>
                        <div className="flex items-center">
                          <Star className="w-5 h-5 text-yellow-400 fill-current mr-1" />
                          <span className="font-bold text-lg">{reviews.overall_rating.toFixed(1)}/5.0</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Total Reviews</span>
                        <span className="font-bold text-lg">{reviews.total_reviews}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">Verified Purchases</span>
                        <span className="font-bold text-lg">{reviews.verified_purchase_percentage}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pros and Cons */}
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center">
                      <TrendingUp className="w-5 h-5 text-green-600 mr-2" />
                      Pros
                    </h3>
                    <ul className="space-y-2">
                      {reviews.pros.map((pro, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-green-600 mr-2">✓</span>
                          <span className="text-gray-700">{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center">
                      <TrendingDown className="w-5 h-5 text-red-600 mr-2" />
                      Cons
                    </h3>
                    <ul className="space-y-2">
                      {reviews.cons.map((con, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-red-600 mr-2">✗</span>
                          <span className="text-gray-700">{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-blue-50 rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-3">Summary</h3>
                  <p className="text-gray-700 leading-relaxed">{reviews.summary}</p>
                </div>

                {/* Common Themes */}
                {reviews.common_themes.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-bold mb-3">Common Themes</h3>
                    <div className="flex flex-wrap gap-2">
                      {reviews.common_themes.map((theme, index) => (
                        <span
                          key={index}
                          className="px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'specs' && (
              <div>
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Basic Info */}
                  <div>
                    <h3 className="text-lg font-bold mb-4">Basic Information</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm text-gray-500">Brand</dt>
                        <dd className="font-semibold">{specifications.brand}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Category</dt>
                        <dd className="font-semibold">{specifications.category}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">Color</dt>
                        <dd className="font-semibold">{specifications.color}</dd>
                      </div>
                      {specifications.style_number && (
                        <div>
                          <dt className="text-sm text-gray-500">Style Number</dt>
                          <dd className="font-semibold">{specifications.style_number}</dd>
                        </div>
                      )}
                      {specifications.fit_type && (
                        <div>
                          <dt className="text-sm text-gray-500">Fit Type</dt>
                          <dd className="font-semibold">{specifications.fit_type}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Material & Care */}
                  <div>
                    <h3 className="text-lg font-bold mb-4">Material & Care</h3>
                    <dl className="space-y-3">
                      <div>
                        <dt className="text-sm text-gray-500">Material</dt>
                        <dd className="font-semibold">{specifications.material}</dd>
                      </div>
                      {specifications.care_instructions && (
                        <div>
                          <dt className="text-sm text-gray-500">Care Instructions</dt>
                          <dd className="text-sm text-gray-700">{specifications.care_instructions}</dd>
                        </div>
                      )}
                      {specifications.country_of_origin && (
                        <div>
                          <dt className="text-sm text-gray-500">Country of Origin</dt>
                          <dd className="font-semibold">{specifications.country_of_origin}</dd>
                        </div>
                      )}
                      {specifications.sustainability && (
                        <div>
                          <dt className="text-sm text-gray-500">Sustainability</dt>
                          <dd className="text-sm text-gray-700">{specifications.sustainability}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>

                {/* Sizes */}
                {specifications.sizes_available.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-bold mb-4">Available Sizes</h3>
                    <div className="flex flex-wrap gap-2">
                      {specifications.sizes_available.map((size, index) => (
                        <span
                          key={index}
                          className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg font-semibold"
                        >
                          {size}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Features */}
                {specifications.features.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-bold mb-4">Key Features</h3>
                    <ul className="grid md:grid-cols-2 gap-3">
                      {specifications.features.map((feature, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-blue-600 mr-2">•</span>
                          <span className="text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Additional Specs */}
                {Object.keys(specifications.additional_specs).length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-bold mb-4">Additional Specifications</h3>
                    <dl className="grid md:grid-cols-2 gap-4">
                      {Object.entries(specifications.additional_specs).map(([key, value]) => (
                        <div key={key}>
                          <dt className="text-sm text-gray-500 capitalize">{key.replace(/_/g, ' ')}</dt>
                          <dd className="font-semibold">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ProductDetails() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <ProductDetailsContent />
    </Suspense>
  );
}
