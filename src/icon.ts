/**
 * Ribbon / tab icon for ChatTaker.
 * Source artwork: ChatTaker_icon.svg (1024×1024). Scaled into Obsidian's 100×100 addIcon space.
 */
export const PLUGIN_ICON_ID = "chattaker";

/** Scale/translate so the drawn bbox fills most of the 100×100 viewBox; stroke uses currentColor. */
const ICON_SCALE = (100 - 8) / 576; // ≈ 0.159722 — height-based, ~4px padding top/bottom
const ICON_TX = (100 - 540 * ICON_SCALE) / 2 - 272 * ICON_SCALE;
const ICON_TY = (100 - 576 * ICON_SCALE) / 2 - 276 * ICON_SCALE;

/** SVG fragment passed to addIcon (no outer <svg>; host supplies viewBox 0 0 100 100). */
export const PLUGIN_ICON_SVG =
  `<g transform="translate(${ICON_TX} ${ICON_TY}) scale(${ICON_SCALE})" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round">` +
  '<path d="M344 760 C302 748 272 708 272 660 V398 C272 330 326 276 394 276 H690 C758 276 812 330 812 398 V514"/>' +
  '<path d="M344 760 V852 L444 766 H506"/>' +
  '<path d="M382 402 H670"/>' +
  '<path d="M382 472 H610"/>' +
  '<path d="M382 542 H520"/>' +
  '<path d="M620 548 H760 C790 548 812 572 812 602 V792 C812 822 790 846 760 846 H620 C590 846 568 822 568 792 V602 C568 572 590 548 620 548 Z"/>' +
  '<path d="M634 548 V678 L694 640 L754 678 V548"/>' +
  "</g>";
