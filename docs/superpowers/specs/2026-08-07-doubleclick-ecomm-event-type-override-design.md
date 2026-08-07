# DoubleClick Ecommerce Activity Tag Override

**Date:** 2026-08-07  
**Branch:** `feature/doubleclick-ecomm-event-type-override`  
**Status:** Approved design

## Problem

DoubleClick (Floodlight) ecommerce fan-out hardcodes the purchase activity tag as `purch0` in the `send_to` path:

`DC-{advertiser_id}/{doubleclick_type}/purch0+transactions`

`platform.event_type` is already passed into `triggerDoubleClickEcommerceEvent`, but it is unused for routing (only appears in error payloads). Teams need to optionally fire purchase revenue against a different Floodlight activity (e.g. `prod0`), the same way Facebook ecommerce allows overriding the event name via `event_type`.

## Goals

- Allow optional `event_type` on a DoubleClick ecommerce platform config to override the purchase activity tag.
- Preserve current behavior when `event_type` is omitted (continue firing `purch0`).
- Match Facebook’s override pattern: main purchase only; sustainer unchanged.
- Keep Floodlight reporting correct and analyzable.

## Non-goals

- Overriding the sustainer activity tag (`susta0`).
- Changing the gtag event name from `'purchase'`.
- New config keys beyond the existing `event_type` field.
- Changing DoubleClick custom-event fan-out (`fireDoubleClickCustomEvent`).

## Background: Floodlight routing

Per [Google Campaign Manager 360 Floodlight gtag docs](https://support.google.com/campaignmanager/answer/7554821):

- **Reporting / attribution** is driven by `send_to`:  
  `DC-[floodlightConfigID]/[activityGroupTagString]/[activityTagString]+[countingMethod]`
- The activity tag string maps to the legacy `cat=` parameter and is what appears in Floodlight activity reporting.
- For sales / transaction activities, Google’s examples use `gtag('event', 'purchase', …)` with `+transactions`, regardless of the activity tag string value.

Therefore this change overrides only the activity tag in `send_to`, and leaves the gtag event name as `'purchase'`.

## Design

### Approach

Reuse the existing `platform.event_type` field (Approach A), consistent with Facebook ecommerce and other platforms.

### Code change (`triggerDoubleClickEcommerceEvent`)

1. Change the function default from `event_type = "purchase"` to `event_type = "purch0"` so omitting the config field preserves today’s behavior.
2. In both enhanced-user-data and standard purchase fires, build:

   ```js
   send_to: `DC-${options.doubleclick_advertiser_id}/${options.doubleclick_type}/${event_type}+transactions`
   ```

3. Leave sustainer fires hardcoded to `susta0+transactions`.
4. Leave `gtag('event', 'purchase', …)` unchanged in all paths.

No changes to the ecommerce switch / dispatcher — it already passes `platform.event_type`.

### Config usage

```js
{
  name: "doubleclick",
  event_type: "prod0", // optional; defaults to purch0
  options: {
    doubleclick_advertiser_id: "...",
    doubleclick_type: "..."
  }
}
```

### Behavior matrix

| Config | Purchase `send_to` activity | Sustainer | gtag event name |
| --- | --- | --- | --- |
| `event_type` omitted | `purch0+transactions` | `susta0+transactions` | `purchase` |
| `event_type: "prod0"` | `prod0+transactions` | `susta0+transactions` | `purchase` |

## Testing

- Omit `event_type` → purchase still targets `purch0+transactions`.
- Set `event_type: "prod0"` → purchase targets `prod0+transactions`; sustainer still `susta0+transactions`.
- Enhanced user-data path (`use_google_ads_enhanced_user_data`) behaves the same for both cases.
- Confirm in network / debugger that Floodlight hits use the expected `send_to` activity tag.

## Risks

- Low. Default change from unused `"purchase"` to `"purch0"` only matters once `event_type` is wired into `send_to`; omitting the field remains equivalent to today’s hardcoded `purch0`.
- Callers who previously set a meaningless `event_type` (thinking it did nothing) could change Floodlight routing if they had a non-`purch0` value. Unlikely; worth a quick audit of known DoubleClick ecommerce configs if available.
