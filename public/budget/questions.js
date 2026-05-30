/*
 * questions.js — the single source of truth for the budget questionnaire.
 *
 * Edit THIS file to add/remove/rename categories. app.js renders everything
 * generically from BUDGET_QUESTIONS, so a new leaf automatically appears in the
 * questionnaire, the per-person summary, and the Compare view (and flows into
 * every total) with no other code changes.
 *
 * IMPORTANT: this file contains category DEFINITIONS only — never any dollar
 * amounts or personal data. All amounts live exclusively in the browser's
 * localStorage at runtime.
 *
 * Stable IDs: each group has an `id`, each leaf an `id`. The storage key for a
 * leaf is `<groupId>.<leafId>`. Changing a `label` is safe; changing an `id`
 * orphans previously stored answers for that item, so avoid it.
 */
window.BUDGET_QUESTIONS = {
  version: 1,

  // Shown on the welcome screen and as a short banner on the questionnaire.
  intro:
    "This is a PERSONAL / household budget only. Please do not include " +
    "business expenses, rental income, or any mortgages or expenses tied to " +
    "rental properties — enter only personal household spending. For each item, " +
    "give the MINIMUM you'd want to spend if money got tight, and the amount " +
    "that feels COMFORTABLE. All amounts are monthly. Enter each thing once.",

  // ---- Spending categories (each leaf gets a Minimum $, Comfortable $, notes) ----
  groups: [
    {
      id: "housing",
      title: "Housing",
      blurb: "Where you live and what it costs to keep the roof on (primary residence only).",
      leaves: [
        { id: "rent_mortgage", label: "Rent or mortgage (principal + interest)", help: "Primary residence only. Monthly rent, or mortgage P&I." },
        { id: "property_tax", label: "Property tax (if not escrowed)", help: "Skip if it's already bundled into your mortgage payment above." },
        { id: "hoa", label: "HOA / condo / strata fees" },
      ],
    },
    {
      id: "utilities",
      title: "Utilities",
      blurb: "The recurring services that keep the house running.",
      leaves: [
        { id: "electricity", label: "Electricity" },
        { id: "gas_heating", label: "Natural gas / heating oil / propane" },
        { id: "water_sewer", label: "Water & sewer" },
        { id: "trash", label: "Trash & recycling" },
        { id: "internet", label: "Internet" },
        { id: "mobile", label: "Mobile phones" },
        { id: "landline", label: "Landline / VoIP" },
      ],
    },
    {
      id: "food",
      title: "Food",
      blurb: "Everything you eat and drink — split out so dining vs. groceries shows up clearly.",
      leaves: [
        { id: "groceries", label: "Groceries & household staples" },
        { id: "dining_out", label: "Dining out / restaurants" },
        { id: "takeout", label: "Takeout & delivery" },
        { id: "coffee", label: "Coffee shops / cafes" },
        { id: "alcohol", label: "Alcohol (store-bought) / bar" },
        { id: "work_lunches", label: "Work lunches / vending / snacks" },
      ],
    },
    {
      id: "transportation",
      title: "Transportation",
      blurb: "Getting around — vehicles, fuel, and fares.",
      leaves: [
        { id: "auto_payment", label: "Auto loan / lease payment(s)" },
        { id: "fuel", label: "Fuel / charging" },
        { id: "auto_insurance", label: "Auto insurance" },
        { id: "auto_maintenance", label: "Maintenance, repairs & tires" },
        { id: "registration", label: "Registration / licensing / inspection" },
        { id: "parking_tolls", label: "Parking & tolls" },
        { id: "transit_rideshare", label: "Public transit / rideshare / taxi" },
        { id: "car_replacement", label: "Car-replacement fund (set-aside for next vehicle)", help: "A monthly amount you mentally set aside toward your next car." },
      ],
    },
    {
      id: "health",
      title: "Health & Medical",
      blurb: "Premiums and out-of-pocket care.",
      leaves: [
        { id: "health_premium", label: "Health insurance premium (your share)" },
        { id: "dental_vision_premium", label: "Dental & vision premiums" },
        { id: "out_of_pocket", label: "Out-of-pocket: copays, deductibles, Rx" },
        { id: "therapy", label: "Therapy / mental health" },
        { id: "planned_dental", label: "Planned dental work / specialists" },
        { id: "eyewear", label: "Eyewear / contacts" },
        { id: "supplements", label: "Supplements / OTC" },
        { id: "hsa_fsa", label: "HSA / FSA contributions (if you treat them as spending)" },
      ],
    },
    {
      id: "insurance",
      title: "Insurance (other)",
      blurb: "Policies not already counted under auto or health.",
      leaves: [
        { id: "home_renters", label: "Home / renters insurance (if not escrowed)" },
        { id: "life", label: "Life insurance" },
        { id: "disability", label: "Disability insurance" },
        { id: "umbrella", label: "Umbrella / liability" },
        { id: "long_term_care", label: "Long-term care" },
        { id: "other_policies", label: "Other policies (jewelry, electronics, identity)" },
      ],
    },
    {
      id: "debt",
      title: "Debt (non-mortgage, non-auto)",
      blurb: "Loan and debt payments. No credit-card line — cards paid in full each month are captured in their real categories.",
      leaves: [
        { id: "student_loans", label: "Student loans" },
        { id: "personal_loans", label: "Personal loans" },
        { id: "medical_debt", label: "Medical debt" },
        { id: "other_debt", label: "Other / line of credit" },
      ],
    },
    {
      id: "children",
      title: "Children & Education",
      blurb: "Kids' costs and any schooling for the household.",
      leaves: [
        { id: "childcare", label: "Daycare / nanny / babysitting" },
        { id: "tuition", label: "School tuition & fees" },
        { id: "extracurriculars", label: "After-school, lessons & extracurriculars" },
        { id: "kids_clothing", label: "Kids' clothing & gear" },
        { id: "camps_sports", label: "Camps / sports / activities" },
        { id: "college_529", label: "College / 529 savings contributions" },
        { id: "adult_education", label: "Adult education / courses (yourself)" },
        { id: "kids_allowance", label: "Kids' allowance / spending money" },
      ],
    },
    {
      id: "personal_care",
      title: "Personal Care",
      blurb: "Grooming, fitness, and looking after yourself.",
      leaves: [
        { id: "haircuts", label: "Haircuts / salon / barber" },
        { id: "cosmetics", label: "Cosmetics & toiletries" },
        { id: "spa_nails", label: "Spa / nails / massage" },
        { id: "gym", label: "Gym / fitness membership" },
        { id: "classes_trainer", label: "Fitness classes / trainer / sports leagues" },
      ],
    },
    {
      id: "clothing",
      title: "Clothing (adults)",
      blurb: "Clothing and accessories for the two of you.",
      leaves: [
        { id: "everyday_clothing", label: "Everyday clothing" },
        { id: "work_attire", label: "Work / professional attire" },
        { id: "shoes", label: "Shoes" },
        { id: "accessories", label: "Accessories / jewelry / dry cleaning" },
      ],
    },
    {
      id: "subscriptions",
      title: "Subscriptions & Memberships",
      blurb: "Recurring digital and membership charges.",
      leaves: [
        { id: "streaming_video", label: "Streaming video (Netflix, etc.)" },
        { id: "music_audio", label: "Music / audio / podcasts" },
        { id: "news", label: "News / magazines" },
        { id: "software_cloud", label: "Software / cloud storage / apps" },
        { id: "warehouse_club", label: "Warehouse / club memberships (Costco, etc.)" },
        { id: "gaming", label: "Gaming subscriptions" },
      ],
    },
    {
      id: "entertainment",
      title: "Entertainment & Recreation",
      blurb: "Fun, hobbies, and going out.",
      leaves: [
        { id: "events", label: "Movies / concerts / events / theater" },
        { id: "hobbies", label: "Hobbies & supplies" },
        { id: "media_purchases", label: "Books / games / media purchases" },
        { id: "sports_gear", label: "Sports / outdoor activities & gear" },
        { id: "nights_out", label: "Nights out / social" },
      ],
    },
    {
      id: "travel",
      title: "Travel & Vacations",
      blurb: "Trips, big and small — entered as a monthly set-aside.",
      leaves: [
        { id: "vacation_fund", label: "Annual vacation fund (monthly set-aside)", help: "Take your expected yearly vacation spend and divide by 12." },
        { id: "weekend_trips", label: "Weekend trips / getaways" },
        { id: "family_travel", label: "Visiting-family travel" },
        { id: "travel_insurance", label: "Travel insurance / passports / visas" },
      ],
    },
    {
      id: "giving",
      title: "Gifts, Giving & Charity",
      blurb: "What you give to others.",
      leaves: [
        { id: "gifts", label: "Holiday & birthday gifts" },
        { id: "charity", label: "Charitable donations / tithing" },
        { id: "family_support", label: "Family support / sending money to relatives" },
        { id: "special_occasions", label: "Special occasions (weddings, showers)" },
      ],
    },
    {
      id: "pets",
      title: "Pets",
      blurb: "Looking after the animals.",
      leaves: [
        { id: "pet_food", label: "Food & supplies" },
        { id: "vet", label: "Vet & medical" },
        { id: "pet_insurance", label: "Pet insurance" },
        { id: "grooming_boarding", label: "Grooming / boarding / walker" },
      ],
    },
    {
      id: "household",
      title: "Household & Maintenance",
      blurb: "Keeping the home stocked and in good repair.",
      leaves: [
        { id: "furniture", label: "Furniture & home goods" },
        { id: "repairs", label: "Repairs & maintenance / handyman" },
        { id: "cleaning", label: "Cleaning service" },
        { id: "lawn_garden", label: "Lawn / garden / snow removal" },
        { id: "appliances", label: "Appliances / electronics replacement" },
        { id: "home_improvement", label: "Home-improvement fund" },
      ],
    },
    {
      id: "savings_future",
      title: "Savings, Investments & Future",
      blurb: "Money you set aside rather than spend.",
      leaves: [
        { id: "emergency_fund", label: "Emergency-fund contributions" },
        { id: "retirement", label: "Retirement contributions (your share, 401k/IRA)" },
        { id: "taxable_investing", label: "Taxable / brokerage investing" },
        { id: "goal_savings", label: "Other goal savings (down payment, big purchase)" },
      ],
    },
    {
      id: "misc",
      title: "Misc & Buffer",
      blurb: "Everything else, plus a cushion for the unexpected.",
      leaves: [
        { id: "bank_fees", label: "Bank / ATM / card fees" },
        { id: "postage", label: "Postage / shipping" },
        { id: "tax_legal", label: "Tax prep / professional / legal fees" },
        { id: "buffer", label: "General buffer / unexpected" },
        { id: "other", label: "Other (use the note field to describe)" },
      ],
    },
  ],

  // ---- Attitude / nuance questions (do NOT enter dollar totals) ----
  // type: "slider" | "radio" | "ranking" | "cut_ratings" | "upcoming" | "reflections"
  attitudes: [
    {
      id: "save_vs_spend",
      type: "slider",
      label: "Save vs. spend disposition",
      help: "1 = spend freely and enjoy now, 10 = save aggressively.",
      min: 1, max: 10, step: 1, unit: "",
    },
    {
      id: "risk_tolerance",
      type: "radio",
      label: "Financial risk tolerance",
      options: [
        { value: "very_conservative", label: "Very conservative" },
        { value: "conservative", label: "Conservative" },
        { value: "moderate", label: "Moderate" },
        { value: "aggressive", label: "Aggressive" },
        { value: "very_aggressive", label: "Very aggressive" },
      ],
    },
    {
      id: "emergency_months",
      type: "slider",
      label: "Emergency-fund target",
      help: "How many months of expenses would you like to keep on hand?",
      min: 0, max: 12, step: 1, unit: " months",
    },
    {
      id: "lifestyle_importance",
      type: "slider",
      label: "Maintaining current lifestyle",
      help: "1 = happy to tighten up, 10 = very important to keep our current lifestyle.",
      min: 1, max: 10, step: 1, unit: "",
    },
    {
      id: "debt_aggressiveness",
      type: "slider",
      label: "Debt-payoff aggressiveness",
      help: "1 = just make minimum payments, 10 = throw everything at debt.",
      min: 1, max: 10, step: 1, unit: "",
    },
    {
      id: "income_stability",
      type: "radio",
      label: "Income stability",
      options: [
        { value: "very_stable", label: "Very stable" },
        { value: "stable", label: "Stable" },
        { value: "somewhat_uncertain", label: "Somewhat uncertain" },
        { value: "uncertain", label: "Uncertain" },
      ],
    },
    {
      id: "willingness_to_cut",
      type: "cut_ratings",
      label: "Willingness to cut each area",
      help: "For each group: 1 = I'd never cut this, 5 = I'd cut this first.",
    },
    {
      id: "upcoming_expenses",
      type: "upcoming",
      label: "Big upcoming expenses (next ~24 months)",
      help: "List anything large you can see coming — a new roof, a car, a wedding.",
    },
    {
      id: "reflections",
      type: "reflections",
      label: "Reflections",
      prompts: [
        { id: "protect", label: "What I most want to protect" },
        { id: "happy_to_cut", label: "What I'd happily cut" },
        { id: "biggest_worry", label: "My biggest money worry" },
      ],
    },
  ],
};
