"""
EcoLoop AI - Sustainability Agent

Calculates green credits and CO2 savings based on the recommended action,
product characteristics, and valuation. Uses a deterministic scoring framework
with category-specific environmental weights.

Pipeline position: Agent 4 of 5
Input: action, condition_grade, product metadata, valuation result
Output: green_credits, co2_savings_kg, sustainability_reasoning
"""

import logging
from dataclasses import dataclass

from agents.valuation_agent import ValuationResult

logger = logging.getLogger("ecoloop.sustainability_agent")


# ---------------------------------------------------------------------------
# Scoring Framework
# ---------------------------------------------------------------------------

# Base green credits by action (donate > refurbish > resell > recycle)
# Rationale: donation has highest social + environmental impact,
# refurbishment extends life significantly, resale keeps product in use,
# recycling recovers materials but product is consumed.
BASE_CREDITS: dict[str, int] = {
    "resell": 10,
    "refurbish": 15,
    "donate": 20,
    "recycle": 5,
}

# Base CO2 savings (kg) by action
# Based on lifecycle analysis approximations for average consumer products.
BASE_CO2_KG: dict[str, float] = {
    "resell": 2.5,
    "refurbish": 1.8,
    "donate": 1.5,
    "recycle": 0.8,
}

# Category weight multipliers for CO2 savings
# Heavier/more resource-intensive products save more CO2 when diverted from landfill.
CATEGORY_CO2_MULTIPLIERS: dict[str, float] = {
    "Electronics": 1.5,    # High embedded carbon (mining, manufacturing)
    "Appliances": 1.8,     # Heavy, high energy to produce
    "Furniture": 1.6,      # Large, resource-intensive
    "Clothing": 1.0,       # Moderate (textile production)
    "Sports Equipment": 1.2,
    "Toys": 0.8,           # Smaller, less embedded carbon
    "Books": 0.5,          # Lightweight, low embedded carbon
}

# Bonus credits for high-value product diversion
# Products worth more represent greater waste if discarded.
VALUE_BONUS_THRESHOLDS = [
    (500, 5),    # Products originally > $500 get +5 bonus credits
    (200, 3),    # Products originally > $200 get +3 bonus credits
    (50, 1),     # Products originally > $50 get +1 bonus credit
]

# Condition-based CO2 bonus
# Better condition = more useful life remaining = more CO2 saved by keeping it in use.
CONDITION_CO2_BONUS: dict[str, float] = {
    "A": 1.0,   # Full useful life remaining
    "B": 0.5,   # Significant life remaining
    "C": 0.2,   # Some additional life
    "D": 0.0,   # Minimal additional life
}


@dataclass
class SustainabilityResult:
    """Output from the Sustainability Agent."""

    green_credits: int
    co2_savings_kg: float
    reasoning: str


class SustainabilityAgent:
    """
    Sustainability Agent — calculates environmental impact metrics.

    Scoring framework (priority order):
      donate (20) > refurbish (15) > resell (10) > recycle (5)

    Credits are further modified by:
    - Product original value (high-value diversion bonus)
    - Category-specific CO2 multiplier
    - Condition grade CO2 bonus
    """

    def calculate(
        self,
        action: str,
        condition_grade: str,
        product_category: str,
        product_age_months: int,
        original_price: float,
        valuation: ValuationResult,
    ) -> SustainabilityResult:
        """
        Calculate green credits and CO2 savings.

        Args:
            action: Recommended action (resell/refurbish/donate/recycle).
            condition_grade: A, B, C, or D.
            product_category: Product category string.
            product_age_months: Product age in months.
            original_price: Original purchase price in USD.
            valuation: ValuationResult from the Valuation Agent.

        Returns:
            SustainabilityResult with credits, CO2 savings, and reasoning.
        """
        logger.info(
            f"Calculating sustainability: action={action}, grade={condition_grade}, "
            f"category={product_category}, price=${original_price:.2f}"
        )

        # Step 1: Base credits
        base_credits = BASE_CREDITS.get(action, 5)

        # Step 2: Value bonus
        value_bonus = self._calculate_value_bonus(original_price)

        # Step 3: Total credits
        total_credits = base_credits + value_bonus

        # Step 4: CO2 savings
        co2_savings = self._calculate_co2_savings(
            action, condition_grade, product_category
        )

        # Step 5: Generate reasoning
        reasoning = self._build_reasoning(
            action=action,
            total_credits=total_credits,
            base_credits=base_credits,
            value_bonus=value_bonus,
            co2_savings=co2_savings,
            product_category=product_category,
            condition_grade=condition_grade,
            valuation=valuation,
        )

        result = SustainabilityResult(
            green_credits=total_credits,
            co2_savings_kg=round(co2_savings, 2),
            reasoning=reasoning,
        )

        logger.info(
            f"Result: credits={result.green_credits} "
            f"(base={base_credits} + bonus={value_bonus}), "
            f"CO2={result.co2_savings_kg}kg, "
            f"reasoning_words={len(result.reasoning.split())}"
        )

        return result

    def _calculate_value_bonus(self, original_price: float) -> int:
        """
        Award bonus credits for high-value product diversion.

        Higher original value = greater waste prevented = more credits.
        """
        for threshold, bonus in VALUE_BONUS_THRESHOLDS:
            if original_price >= threshold:
                return bonus
        return 0

    def _calculate_co2_savings(
        self,
        action: str,
        condition_grade: str,
        product_category: str,
    ) -> float:
        """
        Calculate estimated CO2 savings in kg.

        Formula: base_co2 × category_multiplier + condition_bonus
        """
        base_co2 = BASE_CO2_KG.get(action, 0.8)
        category_mult = CATEGORY_CO2_MULTIPLIERS.get(product_category, 1.0)
        condition_bonus = CONDITION_CO2_BONUS.get(condition_grade, 0.0)

        return base_co2 * category_mult + condition_bonus

    def _build_reasoning(
        self,
        action: str,
        total_credits: int,
        base_credits: int,
        value_bonus: int,
        co2_savings: float,
        product_category: str,
        condition_grade: str,
        valuation: ValuationResult,
    ) -> str:
        """Build a human-readable sustainability reasoning string."""
        parts = [
            f"By choosing to {action} this {product_category} product (grade {condition_grade}),",
            f"you earn {total_credits} green credits",
        ]

        if value_bonus > 0:
            parts.append(f"(including {value_bonus} bonus for high-value diversion)")

        parts.append(
            f"and prevent an estimated {co2_savings:.1f} kg of CO2 emissions."
        )

        if action == "resell" and valuation.has_significant_value:
            parts.append(
                f"Reselling at {valuation.display} extends the product lifecycle while recovering value."
            )
        elif action == "refurbish":
            parts.append(
                "Refurbishment restores functionality, maximizing the product's remaining useful life."
            )
        elif action == "donate":
            parts.append(
                "Donation creates social value while keeping the product out of landfill."
            )
        elif action == "recycle":
            parts.append(
                "Responsible recycling recovers raw materials for reuse in new products."
            )

        return " ".join(parts)


# Module-level singleton
sustainability_agent = SustainabilityAgent()
