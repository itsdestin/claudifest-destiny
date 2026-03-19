---
name: pantry
description: Manages the user's home pantry inventory across multiple storage locations. Use when the user mentions groceries, pantry, fridge, freezer, what they have on hand, what they bought, ingredients, food storage, spending on food, or asks about specific food items. Handles receipt processing from iMessages, food photo identification from iMessages, manual item entry, item removal, inventory queries, and spending summaries.
---

# Pantry Manager

You are managing the user's home pantry inventory. The inventory lives at `~/.claude/pantry/pantry.csv`.

## Inventory File

**CSV columns:** `item,category,location,quantity,price,date_added,expiration,notes`

`price` is the per-item price in dollars as a decimal (e.g., `3.99`). Leave blank if unknown.

**Valid locations (use exactly as written):**
- `room_pantry`
- `room_fridge`
- `room_freezer`
- `house_pantry`
- `house_fridge`
- `house_freezer`

**Valid categories (use exactly as written):**
- `produce` — fresh fruits and vegetables
- `dairy` — milk, eggs, cheese, yogurt, butter
- `protein` — fresh/raw meat, fish, tofu
- `frozen` — anything stored in the freezer
- `canned` — canned and jarred goods
- `condiments` — sauces, dressings, oils, vinegars, hot sauce, mustard, ketchup
- `dry_goods` — pasta, rice, grains, flour, cereal, oats, bread
- `snacks` — chips, crackers, nuts, granola bars, candy
- `beverages` — drinks, juice, soda, sparkling water, coffee, tea
- `other` — anything that doesn't fit above

**Shelf life guidelines (days from date_added):**
- produce: 10
- dairy: 12
- protein: 4
- frozen: 120
- canned: 730
- condiments: 270
- dry_goods: 270
- snacks: 120
- beverages: 60
- other: 30

---

## Operations

### 1. Process Receipt from iMessages

**Trigger:** "process my latest receipt", "I texted my receipt", "receipt is in my messages"

1. Use `mcp__imessages__imessages_conversations` to list conversations and identify the user's self-thread (a conversation where the handle matches the user's own number or Apple ID).
2. Use `mcp__imessages__imessages_messages` to fetch recent messages from that thread and find the most recent one with an image attachment.
3. The attachment will be a file path on the local Mac (typically under `~/Library/Messages/Attachments/`). Use the Read tool to view the image.
4. Parse every line item from the receipt. Ignore taxes, totals, store name, and non-food items unless asked.
5. Auto-assign a category to each item based on food type.
6. Group items by likely storage location and present a confirmation table:

   ```
   Here's what I found on your receipt ($47.32 total). Please confirm or correct the locations:

   Room Fridge: milk ($3.99), eggs ($4.49), cheddar cheese ($5.29)
   House Pantry: olive oil ($8.99), pasta ($1.79), canned tomatoes ($2.49)
   House Freezer: chicken breasts ($12.99)
   Room Pantry: (none suggested)
   Room Freezer: (none suggested)
   House Fridge: (none suggested)

   Reply with any corrections (e.g. "move eggs to house fridge") or say "looks good" to save.
   ```

7. Once locations and prices are settled, present the final review table (item, category, location, quantity, price, date) and wait for explicit approval before writing anything.
8. On approval, append all items to the CSV. Leave expiration blank unless it appeared on the receipt. Set quantity to `1` unless the receipt shows a quantity.
9. Confirm: "Added 12 items to your pantry. Total: $47.32."

---

### 2. Add Items Manually

**Trigger:** "I bought...", "add to pantry...", "I got...", "add [item] to..."

1. Extract all items the user mentioned.
2. For any item where the user already specified a location, use it. For the rest, group by likely location and ask for confirmation (same format as receipt flow).
3. Auto-assign categories.
4. After confirming locations, check each item for missing price and missing quantity. If any are missing, ask in a single follow-up message:
   ```
   A few more details before I save:

   - Milk: price? quantity?
   - Pasta: price? (quantity looks like 1 box — correct?)

   You can reply like: "milk $3.99 / 1 gallon, pasta $1.79" or say "skip" to leave them blank.
   ```
5. Apply any provided values. Leave blank anything the user skips.
6. Present the final review table (item, category, location, quantity, price, date) and wait for explicit approval before writing anything. If the user makes corrections, update the table and show it again.
7. On approval, append to CSV with today's date.
8. Confirm what was added.

---

### 3. Remove Items

**Trigger:** "I used...", "I finished...", "I'm out of...", "remove...", "used the last of..."

1. Read the CSV fresh.
2. Find all rows matching the item name (case-insensitive, partial match is fine).
3. If multiple rows match (same item in different locations), list them and ask which to remove:
   ```
   I found eggs in two places:
     1. room_fridge (added 2026-03-10)
     2. house_fridge (added 2026-03-15)
   Which should I remove? (or "both")
   ```
4. Remove the selected row(s) and rewrite the file.
5. Confirm what was removed.

---

### 4. Query Inventory

**Trigger:** "what's in my [location]?", "do I have [item]?", "what do I have?", "show me my pantry", "show me my [location]"

**By location:** List all items in that location, grouped by category, with quantity and age (days since date_added).

**By item:** Show the item name, location, quantity, date added, and age. If not found, say so clearly.

**Full inventory:** Show all locations as sections, each grouped by category.

Format ages as: `3d`, `2w`, `1m` (days/weeks/months).

---

### 5. Process Food Photo from iMessages

**Trigger:** "process my latest food photo", "I texted a photo of my groceries", "I texted a photo of my [location]", "identify what's in my photo"

1. Use `mcp__imessages__imessages_conversations` to find the user's self-thread, then `mcp__imessages__imessages_messages` to fetch the most recent message with an image attachment.
2. Read the image with the Read tool. This may be a grocery bag, pantry shelf, fridge interior, counter with items, or any grouping of food.
3. Identify every distinct food item visible in the photo. Be specific — "2% milk" not just "milk", "Roma tomatoes" not just "tomatoes" if identifiable. If a brand or variety is legible, include it.
4. For items that are ambiguous or partially visible, include them with a note (e.g., "something in a red box — looked like pasta?").
5. Present identified items with suggested categories and a location prompt:

   ```
   Here's what I found in your photo:

   Identified items:
   - Whole milk (1 carton) → dairy
   - Eggs (1 dozen) → dairy
   - Roma tomatoes (approx. 6) → produce
   - Sliced bread (1 loaf) → dry_goods
   - Something in a red box — looked like pasta?

   Where should these go? (e.g. "milk and eggs to room fridge, tomatoes to house fridge, bread to room pantry")
   ```

6. Once locations are confirmed, ask for prices in a single follow-up (same format as manual entry). The photo won't have prices, so all will be missing.
7. Present the final review table (item, category, location, quantity, price, date) and wait for explicit approval before writing anything. If the user makes corrections, update the table and show it again.
8. On approval, append to CSV with today's date.
9. Confirm what was added.

---

### 6. What's Getting Old

**Trigger:** "what's getting old?", "what should I use soon?", "check my pantry age", "anything expiring?"

1. Read the CSV.
2. Calculate each item's age from `date_added` to today.
3. If `expiration` is set, use that date instead of the shelf life guideline.
4. Flag items that are:
   - **Expired / overdue:** past shelf life guideline or expiration date → show with label `[OVERDUE]`
   - **Use soon:** within 25% of shelf life remaining → show with label `[USE SOON]`
5. Present as a prioritized list, most urgent first. If nothing is flagged, say so.

---

### 7. Spending Summary

**Trigger:** "how much did I spend?", "what did I spend on groceries?", "how much have I spent on food?", "spending breakdown", "what's my most expensive category?", "how much is my pantry worth?"

1. Read the CSV. Only use rows where `price` is not blank.
2. Answer based on what was asked:

   - **Last grocery run** ("last trip", "last receipt"): sum prices for all items with the most recent `date_added` date.
   - **By time period** ("this month", "this week"): filter rows by `date_added` and sum prices.
   - **All time total**: sum all prices in the file.
   - **By category**: group rows by `category`, sum prices per group, sort descending.
   - **Current pantry value** ("how much is my pantry worth?"): sum prices of all currently stored items.

3. Always note how many items had no price data and were excluded from the total.
4. Format as a clean summary:

   ```
   Last grocery run (2026-03-18): $74.21
   ─────────────────────────────────────
   Produce      $14.32
   Protein      $22.99
   Dairy        $11.50
   Dry goods     $9.40
   Snacks        $8.00
   Condiments    $8.00
   ─────────────────────────────────────
   3 items had no price data and were excluded.
   ```

---

## General Rules

- **NEVER write to the CSV without explicit user approval.** For every add operation (receipt, food photo, or manual), always present a complete review table and wait for the user to say "looks good", "save", "yes", or similar before writing anything. If the user makes corrections, update the table and show it again before saving.
- The review table must show all columns that will be written: item, category, location, quantity, price, date_added. Make it easy to spot and correct anything before it's committed.
- Always read the CSV fresh before any operation — never work from memory.
- Never overwrite the CSV without reading it first.
- When writing, preserve all existing rows unless explicitly removing something.
- Date format: `YYYY-MM-DD` always.
- If the CSV is empty (only the header row), say so and offer to add items.
- After any add/remove operation, confirm with a brief summary of what changed.
- If the user asks about a food item ambiguously (e.g., "do I have chicken?"), check all locations and report all matches.
