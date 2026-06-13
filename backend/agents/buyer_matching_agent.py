"""
EcoLoop AI - Buyer Matching Agent

Generates buyer personas for products recommended for resale.
Uses deterministic logic based on product category, condition, value, and age.

Pipeline position: Agent 5 of 5
Input: product_category, condition_grade, valuation_result, action, age, original_price
Output: list of BuyerPersona (3-5 personas with label, description, match_score, rationale)
Condition: Only generates personas when action == "resell"
"""

import logging
from dataclasses import dataclass, field

from agents.valuation_agent import ValuationResult

logger = logging.getLogger("ecoloop.buyer_matching_agent")


# ---------------------------------------------------------------------------
# Persona Database — category-specific buyer archetypes
# ---------------------------------------------------------------------------

# Each persona template: (label, description_template, base_score, conditions)
# Conditions: dict of criteria that boost/reduce the match score
PERSONA_TEMPLATES: dict[str, list[dict]] = {
    "Electronics": [
        {
            "label": "Budget Tech Enthusiast",
            "description": "Tech-savvy buyer seeking functional electronics at a discount. Comfortable with minor cosmetic wear if core functionality is intact.",
            "base_score": 8,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
        {
            "label": "College Student",
            "description": "Student on a tight budget looking for affordable laptops, phones, or peripherals for coursework and daily use.",
            "base_score": 7,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Refurbishment Reseller",
            "description": "Small business owner who purchases used electronics, repairs minor issues, and resells at profit on marketplace platforms.",
            "base_score": 6,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Eco-Conscious Professional",
            "description": "Environmentally aware professional who deliberately chooses pre-owned electronics to reduce e-waste and their carbon footprint.",
            "base_score": 7,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
        {
            "label": "Parent / Family Buyer",
            "description": "Parent seeking affordable electronics for children's education or family entertainment without paying full retail price.",
            "base_score": 5,
            "prefers_grades": ["A", "B", "C"],
            "price_range": "low",
        },
    ],
    "Clothing": [
        {
            "label": "Thrift Fashion Lover",
            "description": "Fashion-forward buyer who enjoys curating unique pre-owned pieces and values sustainability in their wardrobe choices.",
            "base_score": 8,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
        {
            "label": "Budget-Conscious Shopper",
            "description": "Value-driven buyer looking for quality clothing at reduced prices for everyday wear.",
            "base_score": 7,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Vintage Collector",
            "description": "Collector seeking specific brands, eras, or styles of clothing that appreciate in value over time.",
            "base_score": 6,
            "prefers_grades": ["A", "B"],
            "price_range": "high",
        },
        {
            "label": "Capsule Wardrobe Builder",
            "description": "Minimalist buyer building a curated wardrobe of quality essentials, open to pre-owned items in excellent condition.",
            "base_score": 7,
            "prefers_grades": ["A"],
            "price_range": "mid",
        },
    ],
    "Furniture": [
        {
            "label": "First-Time Apartment Renter",
            "description": "Young professional furnishing their first apartment on a budget, seeking functional pieces that don't need to last decades.",
            "base_score": 8,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Home Office Upgrader",
            "description": "Remote worker looking for quality desk, chair, or storage solutions at a fraction of retail for their home workspace.",
            "base_score": 7,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
        {
            "label": "DIY Upcycler",
            "description": "Creative buyer who refinishes and customizes furniture pieces, valuing solid construction over cosmetic condition.",
            "base_score": 6,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Staging Professional",
            "description": "Real estate staging professional who needs attractive, affordable furniture for temporary property presentations.",
            "base_score": 5,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
    ],
    "Books": [
        {
            "label": "Avid Reader",
            "description": "Book lover who reads frequently and values content over pristine condition, building their personal library affordably.",
            "base_score": 8,
            "prefers_grades": ["A", "B", "C"],
            "price_range": "low",
        },
        {
            "label": "Student / Academic",
            "description": "Student seeking affordable textbooks and reference materials for coursework.",
            "base_score": 7,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Collector",
            "description": "Book collector seeking specific editions, out-of-print titles, or well-preserved copies for their collection.",
            "base_score": 6,
            "prefers_grades": ["A"],
            "price_range": "high",
        },
    ],
    "Toys": [
        {
            "label": "Budget-Conscious Parent",
            "description": "Parent looking for affordable toys in good condition for young children who will outgrow them quickly.",
            "base_score": 8,
            "prefers_grades": ["A", "B"],
            "price_range": "low",
        },
        {
            "label": "Toy Collector",
            "description": "Collector seeking specific vintage or limited-edition toys, valuing completeness and condition highly.",
            "base_score": 6,
            "prefers_grades": ["A"],
            "price_range": "high",
        },
        {
            "label": "Daycare / Playgroup",
            "description": "Daycare operator or playgroup organizer seeking bulk affordable toys that are safe and still functional.",
            "base_score": 7,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
    ],
    "Appliances": [
        {
            "label": "First-Home Buyer",
            "description": "New homeowner or renter furnishing their first kitchen/laundry on a budget, seeking reliable appliances at reduced cost.",
            "base_score": 8,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
        {
            "label": "Landlord / Property Manager",
            "description": "Property manager seeking functional appliances for rental units where premium aesthetics aren't required.",
            "base_score": 7,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Eco-Conscious Homeowner",
            "description": "Environmentally motivated buyer choosing pre-owned appliances to reduce manufacturing demand and e-waste.",
            "base_score": 6,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
    ],
    "Sports Equipment": [
        {
            "label": "Beginner Athlete",
            "description": "Someone starting a new sport who wants to try equipment without committing to full retail price.",
            "base_score": 8,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
        {
            "label": "Youth Sports Parent",
            "description": "Parent buying gear for a growing child who will outgrow equipment quickly, seeking functional quality at low cost.",
            "base_score": 7,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
        {
            "label": "Fitness Enthusiast",
            "description": "Regular gym-goer or outdoor enthusiast looking to expand their equipment collection without breaking the bank.",
            "base_score": 6,
            "prefers_grades": ["A", "B"],
            "price_range": "mid",
        },
        {
            "label": "Community Program",
            "description": "Community center or school program seeking affordable sports equipment for group activities and youth development.",
            "base_score": 5,
            "prefers_grades": ["B", "C"],
            "price_range": "low",
        },
    ],
}

# Default personas for unknown categories
DEFAULT_PERSONAS = [
    {
        "label": "Budget-Conscious Buyer",
        "description": "Value-driven shopper seeking quality products at reduced prices.",
        "base_score": 7,
        "prefers_grades": ["A", "B", "C"],
        "price_range": "low",
    },
    {
        "label": "Eco-Conscious Consumer",
        "description": "Environmentally motivated buyer choosing pre-owned to reduce waste.",
        "base_score": 6,
        "prefers_grades": ["A", "B"],
        "price_range": "mid",
    },
    {
        "label": "Reseller",
        "description": "Small business owner purchasing used items to refurbish and resell at profit.",
        "base_score": 5,
        "prefers_grades": ["B", "C"],
        "price_range": "low",
    },
]


@dataclass
class BuyerPersonaResult:
    """A single buyer persona."""

    label: str
    description: str
    relevance_score: int  # 1-10
    rationale: str


@dataclass
class BuyerMatchingResult:
    """Output from the Buyer Matching Agent."""

    personas: list[BuyerPersonaResult] = field(default_factory=list)
    skipped: bool = False
    skip_reason: str = ""


class BuyerMatchingAgent:
    """
    Buyer Matching Agent — generates buyer personas for resellable products.

    Only executes when action == "resell". For other actions, returns empty result.
    Uses deterministic scoring based on product category, condition, value, and age.
    """

    def match(
        self,
        product_category: str,
        condition_grade: str,
        valuation: ValuationResult,
        action: str,
        product_age_months: int,
        original_price: float,
    ) -> BuyerMatchingResult:
        """
        Generate buyer personas for the product.

        Args:
            product_category: Product category string.
            condition_grade: A, B, C, or D.
            valuation: ValuationResult from Valuation Agent.
            action: Recommended action from Decision Agent.
            product_age_months: Product age in months.
            original_price: Original price in USD.

        Returns:
            BuyerMatchingResult with personas (empty if action != "resell").
        """
        logger.info(
            f"Matching: category={product_category}, grade={condition_grade}, "
            f"action={action}, value={valuation.display}, age={product_age_months}mo"
        )

        # Only generate personas for resell recommendations
        if action != "resell":
            logger.info(f"Skipped: action is '{action}', not 'resell'")
            return BuyerMatchingResult(
                skipped=True,
                skip_reason=f"Buyer personas only generated for 'resell' action. Current action: '{action}'.",
            )

        # Get persona templates for this category
        templates = PERSONA_TEMPLATES.get(product_category, DEFAULT_PERSONAS)

        # Score and rank personas
        scored_personas = []
        for template in templates:
            score = self._calculate_relevance(
                template=template,
                condition_grade=condition_grade,
                valuation=valuation,
                product_age_months=product_age_months,
                original_price=original_price,
            )
            rationale = self._build_rationale(
                template=template,
                score=score,
                condition_grade=condition_grade,
                valuation=valuation,
            )
            scored_personas.append(
                BuyerPersonaResult(
                    label=template["label"],
                    description=template["description"],
                    relevance_score=score,
                    rationale=rationale,
                )
            )

        # Sort by score descending, take top 3-5
        scored_personas.sort(key=lambda p: p.relevance_score, reverse=True)
        top_personas = scored_personas[:5]

        # Filter out very low scores (< 4)
        top_personas = [p for p in top_personas if p.relevance_score >= 4]

        # Ensure at least 3
        if len(top_personas) < 3:
            top_personas = scored_personas[:3]

        result = BuyerMatchingResult(personas=top_personas)

        logger.info(
            f"Generated {len(result.personas)} personas: "
            + ", ".join(f"{p.label}({p.relevance_score})" for p in result.personas)
        )

        return result

    def _calculate_relevance(
        self,
        template: dict,
        condition_grade: str,
        valuation: ValuationResult,
        product_age_months: int,
        original_price: float,
    ) -> int:
        """
        Calculate relevance score (1-10) for a persona template.

        Modifiers:
        - +2 if condition grade matches persona's preferred grades
        - -1 if condition grade doesn't match preferences
        - +1 if price range aligns with resale value
        - -1 if product is very old (>48 months)
        """
        score = template["base_score"]

        # Grade preference modifier
        if condition_grade in template.get("prefers_grades", []):
            score += 2
        else:
            score -= 1

        # Price range alignment
        price_range = template.get("price_range", "mid")
        resale_value = valuation.base_value

        if price_range == "low" and resale_value < original_price * 0.3:
            score += 1
        elif price_range == "mid" and original_price * 0.2 <= resale_value <= original_price * 0.6:
            score += 1
        elif price_range == "high" and resale_value > original_price * 0.5:
            score += 1

        # Age penalty for very old products
        if product_age_months > 48:
            score -= 1

        # Clamp to 1-10
        return max(1, min(10, score))

    def _build_rationale(
        self,
        template: dict,
        score: int,
        condition_grade: str,
        valuation: ValuationResult,
    ) -> str:
        """Build a brief rationale for why this persona matches."""
        grade_match = condition_grade in template.get("prefers_grades", [])
        grade_text = "matches" if grade_match else "partially matches"

        return (
            f"Score {score}/10. Condition grade {condition_grade} {grade_text} "
            f"this buyer's preferences. Resale value of {valuation.display} "
            f"aligns with their {template.get('price_range', 'mid')}-range budget."
        )


# Module-level singleton
buyer_matching_agent = BuyerMatchingAgent()
