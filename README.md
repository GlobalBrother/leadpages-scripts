# Leadpages Scripts

External JavaScript files for Leadpages to bypass validation restrictions.

## Files

### interactive-content.js
Dynamic content display based on URL parameters. Shows/hides page sections based on product slugs.

**Usage in Leadpages:**
```html
<script src="https://cdn.jsdelivr.net/gh/GlobalBrother/leadpages-scripts@main/interactive-content.js"></script>
```

**Component naming convention:**
- Format: `[prefix]-[slug]`
- Example: `title-interactive-amish-fire-cider`

**Supported slugs:**
- `default` - Default variant
- `amish-fire-cider` - Amish Fire Cider product
- `herbal-parasite-flush` - Herbal Parasite Flush product

**Component prefixes (configurable in script):**
- `title-interactive`
- `interactivesection`

## Setup

1. Create sections in Leadpages with IDs following the pattern: `[prefix]-[slug]`
2. Add the script in Global Scripts or page-specific tracking code
3. Script automatically detects URL and shows correct variants
