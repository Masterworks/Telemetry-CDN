# DoubleClick Ecommerce event_type Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow optional `platform.event_type` to override the DoubleClick ecommerce purchase activity tag in `send_to` (default `purch0`), matching Facebook’s ecomm override pattern.

**Architecture:** `triggerDoubleClickEcommerceEvent` already receives `platform.event_type` but ignores it for routing. Change the default to `"purch0"` and interpolate `event_type` into the purchase `send_to` path only. Leave sustainer (`susta0`) and `gtag('event', 'purchase', …)` unchanged. No dispatcher changes.

**Tech Stack:** Browser `telemetry.js` CDN script; Floodlight via `gtag`; no automated test harness in this repo.

**Spec:** `docs/superpowers/specs/2026-08-07-doubleclick-ecomm-event-type-override-design.md`

---

## File map

| File | Role |
| --- | --- |
| `telemetry.js` | Sole implementation change: `triggerDoubleClickEcommerceEvent` (~lines 1444–1503) |

---

### Task 1: Wire `event_type` into purchase `send_to`

**Files:**
- Modify: `telemetry.js` (`triggerDoubleClickEcommerceEvent`)

- [ ] **Step 1: Update function default and purchase `send_to` paths**

In `telemetry.js`, change:

```js
function triggerDoubleClickEcommerceEvent(ecommerce_data, options = {}, event_type = "purchase") {
```

to:

```js
function triggerDoubleClickEcommerceEvent(ecommerce_data, options = {}, event_type = "purch0") {
```

Replace both hardcoded purchase `send_to` strings (enhanced and non-enhanced branches):

```js
'send_to': `DC-${options.doubleclick_advertiser_id}/${options.doubleclick_type}/purch0+transactions`,
```

with:

```js
'send_to': `DC-${options.doubleclick_advertiser_id}/${options.doubleclick_type}/${event_type}+transactions`,
```

Do **not** change:
- Sustainer `send_to` (`susta0+transactions`)
- `gtag('event', 'purchase', …)` event name
- Dispatcher / `case "doubleclick"` (already passes `platform.event_type`)

After edit, the function should look like:

```js
function triggerDoubleClickEcommerceEvent(ecommerce_data, options = {}, event_type = "purch0") {
    if (typeof gtag === "undefined") {
        throw new MasterworksTelemetryError("gtag is undefined").reportError();
    }

	if (!options.doubleclick_advertiser_id || typeof options.doubleclick_advertiser_id !== "string") {
		throw new MasterworksTelemetryError("Invalid options.doubleclick_advertiser_id", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	if (!options.doubleclick_type || typeof options.doubleclick_type !== "string") {
		throw new MasterworksTelemetryError("Invalid options.doubleclick_type", { ecommerce_data: ecommerce_data, event_type: event_type, options: options }).reportError();
	}

	if (options.use_google_ads_enhanced_user_data){

		getGAEnhancedUserData().then(userData => {
			gtag('event', 'purchase', {
				'allow_custom_scripts': true,
				'value': ecommerce_data.total_transaction_amount,
				'transaction_id': ecommerce_data.transaction_id,
				'send_to': `DC-${options.doubleclick_advertiser_id}/${options.doubleclick_type}/${event_type}+transactions`,
				'user_data': userData,
			});

			ecommerce_data.items.forEach(item => {
				if (item.category === "sustainer") {
					gtag('event', 'purchase', {
						'allow_custom_scripts': true,
						'value': item.price,
						'transaction_id': ecommerce_data.transaction_id + "-" + item.sku,
						'send_to': `DC-${options.doubleclick_advertiser_id}/${options.doubleclick_type}/susta0+transactions`,
						'user_data': userData,
					});
				}
			});
			
		})
	} else {
		// Track regular purchase
		gtag('event', 'purchase', {
			'allow_custom_scripts': true,
			'value': ecommerce_data.total_transaction_amount,
			'transaction_id': ecommerce_data.transaction_id,
			'send_to': `DC-${options.doubleclick_advertiser_id}/${options.doubleclick_type}/${event_type}+transactions`
		});

		// Check if any items are sustainer donations and track separately
		ecommerce_data.items.forEach(item => {
			if (item.category === "sustainer") {
				gtag('event', 'purchase', {
					'allow_custom_scripts': true,
					'value': item.price,
					'transaction_id': ecommerce_data.transaction_id + "-" + item.sku,
					'send_to': `DC-${options.doubleclick_advertiser_id}/${options.doubleclick_type}/susta0+transactions`
				});
			}
		});
		
	}
}
```

- [ ] **Step 2: Verify with ripgrep that purchase hardcoding is gone and sustainer remains**

Run:

```bash
rg -n "purch0|susta0|event_type = \"purch0\"|triggerDoubleClickEcommerceEvent" telemetry.js
```

Expected:
- Function default: `event_type = "purch0"`
- Purchase `send_to` uses `${event_type}+transactions` (two places)
- Sustainer still hardcodes `susta0+transactions` (two places)
- No remaining hardcoded `purch0+transactions` in this function

- [ ] **Step 3: Commit**

```bash
git add telemetry.js
git commit -m "$(cat <<'EOF'
Allow DoubleClick ecommerce event_type to override purchase activity tag.

EOF
)"
```

---

### Task 2: Manual verification checklist

No automated tests exist in this repo. Verify by inspection / browser debugger when available:

- [ ] **Step 1: Confirm behavior matrix against code**

| Config | Expected purchase activity | Sustainer | gtag event |
| --- | --- | --- | --- |
| `event_type` omitted | `purch0+transactions` | `susta0+transactions` | `purchase` |
| `event_type: "prod0"` | `prod0+transactions` | `susta0+transactions` | `purchase` |

- [ ] **Step 2: Optional live check**

If a test page is available: configure a DoubleClick ecomm platform with `event_type: "prod0"`, complete a purchase, and confirm the Floodlight hit `send_to` contains `prod0+transactions`.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Default `purch0` when omitted | Task 1 Step 1 (default arg) |
| Override via `event_type` in purchase `send_to` | Task 1 Step 1 |
| Keep `+transactions` | Task 1 Step 1 |
| Sustainer stays `susta0` | Task 1 Step 1 (unchanged) |
| gtag event name stays `purchase` | Task 1 Step 1 (unchanged) |
| Both enhanced and non-enhanced paths | Task 1 Step 1 |
| No new config keys / dispatcher changes | N/A (no edits) |
