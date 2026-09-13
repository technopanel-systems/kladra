/**
 * How wide a wide form stands on a desk (SPEC §3, P13).
 *
 * The quotation request dialog was every other form's 32rem box, and the founder
 * reported twice that it was too narrow and that it compacted as items were
 * added: nine fields a line, the line's m² and total, and from P13 a services
 * section under them do not fit a box made for a company's name and a phone.
 * `ResponsiveDialog size="wide"` stands at this width from `lg` up, never wider
 * than the screen less a gutter, and the width is stated rather than taken from
 * the content, so it does not move as lines are added.
 *
 * 1152px (72rem, on the 8px rhythm): the line table's twelve columns need about
 * 1,120px between the dialog's own 16px sides for a searchable choice to still
 * show "Choose…" and a price to show seven figures, and on the 1366 laptop this
 * office works on it leaves a strip of the list either side, so the form still
 * reads as a form over its list rather than as a page.
 *
 * No React and no server imports: a pure constant the dialog and the spec read.
 */
export const WIDE_DIALOG_PX = 1152;
