# SPEC — Kladra

Kladra is the CRM and operations tool for Technopanel, a Riyadh company selling aluminium
composite panel (ACP) cladding. Fourteen people. It replaces FACET, whose interface users
rejected as overwhelming, record-first and slow. What follows is the business, the founder's
decisions, and the defaults Claude chose. How it looks is DESIGN.md.

## §1 People

- **Rep** — owns companies, logs what happened, requests quotations, raises dispatches, chases customers. Has a monthly m² target.
- **Coordinator** — the desk: issues quotations in SMAC and types the number back, or sends a request back; approves or refuses dispatch requests. No target.
- **Manager** — sees every rep, every company, the team table and what is stuck. No personal target; the company target is his measure.
- **Admin** — users, passwords, targets, lookups, holidays, export. Sees what the manager sees.

Real team: Jerom (admin) · Abdulrahman Al-Zahrani (manager) · Rawan (coordinator) ·
Faisal Al-Harbi, Saad Al-Qahtani, Turki Al-Shammari (reps). Marketing works as a rep for now.

## §2 How the business works

- S1 Technopanel sells cladding and ACP sheets, mostly to companies in Saudi Arabia, some in the Gulf and the wider region.
- S2 A customer is a company. The people at it are contacts. A contact belongs to one company; if a person moves, a new contact is created at the new company.
- S3 Companies arrive from a rep's own search, from marketing, from a referral, an exhibition, online or WhatsApp. Lead source is how the founder learns where business comes from.
- S4 The rep who adds a company owns it. Reps see only their own companies; the manager sees all.
- S5 A project is a job at a customer: a tower, a villa, a mall. It carries the rep's expected m², his forecast. Cladding is project-driven with long cycles; many enquiries never mature.
- S6 Work is logged as it happens: a visit, a call, a WhatsApp, something else, on a date, with what happened and when to follow up. The log is the daily report; nobody writes a separate one.
- S7 A rep asks for a quotation by writing the lines; the coordinator creates the real quotation in SMAC. SMAC is the financial record — quotations, invoices, tax, stock. Kladra never claims to be. There is no integration: every SMAC number is typed by a human.
- S8 The coordinator issues a quotation by entering its SMAC number, or sends the request back with a reason. Nothing else.
- S9 Prices are per m². m² are always computed from width × length × quantity, never typed. VAT is 15%, fixed. Currency is SAR.
- S10 A revision is a new quotation linked to the old one; SMAC gives it a new number. The old one keeps its history.
- S11 The customer's answer belongs to the quotation: accepted or rejected with a reason. Losing a project is a separate judgement of the rep, with a reason.
- S12 A dispatch is the customer's reply to a quotation: what is actually being shipped, possibly part of what was quoted. One quotation can produce several dispatches.
- S13 The rep raises a dispatch; the coordinator checks it and approves it with the SMAC dispatch number, or refuses it with a reason. Approval is the only event that counts.
- S14 Targets are m² per month, never money. Approved m² counts toward the rep's target in the month of approval. Nobody types how much they did.
- S15 The company has one m² target per month, set by the admin; it does not derive from the reps' targets.
- S16 Friday and Saturday are the weekend. Public holidays and personal leave are non-working days. Pace is working days elapsed over working days in the month.
- S17 Never-contacted companies get a reminder after 14 days. A follow-up not done is overdue the day after its date.
- S18 English is the main language; Arabic is available for those who find English hard. Dates are 04/Aug/2026 in both.
- S19 Nothing is deleted. Users are deactivated, never removed; history keeps pointing at a real person.
- S20 Every change is audit-logged: who, what, when, which record.

## §3 Founder decisions from user testing

- Company has NO phone; phone is on the contact and mandatory there.
- Company form: Name · Category (Other last) · Lead source (Other last) · Country (Saudi Arabia default) · City (Riyadh default) · Notes. Contact captured in the same popup: Name · Phone · Position · Email · Notes.
- Lead sources: no Contractor, no Architect; Online and WhatsApp separate; Other last.
- Countries pinned: Saudi Arabia, UAE, Bahrain, Kuwait, Qatar, Oman; rest alphabetical; searchable. Cities pinned: Riyadh, Jeddah, Dammam, Khobar, Makkah, Madinah; rest alphabetical; searchable. Non-Saudi → city free text.
- Project: no state at creation; "Mark lost (reason)" is a later action. No in-production / committed flags.
- Next follow-up: date picker, shown at top, surfaces as due today / overdue on the rep's home. Date format everywhere 04/Aug/2026.
- Quotation lines are Item 1, Item 2… Columns: Colour code · Supplier (N/K/C/D) · Fire rating (B1/A2/Normal) · Class · Qty · Thickness · Width (1.24 / 1.5 / 2.0 / Other → number) · Length · Price per m². m² = width × length × qty. Line total, VAT 15% and grand total shown live. No internal codes shown, ever.
- Quotation raised from inside a company or a project, in a popup.
- Coordinator's quotation actions are exactly two: Issue (enter SMAC number) and Send back (reason). Customer accepted / rejected (reason) is the rep's action, on the rep's screen, after issue.
- Dispatch raised from an issued quotation, in a popup: pick items and quantities (partial allowed), shipment method, destination, payment terms written by the rep. Coordinator checks, then Approve (enter SMAC dispatch number) or Refuse (reason). Approved m² counts toward the rep's target in the month of approval.
- Manager has no personal target; sees the company target and everyone's achieved, his own included as team.
- Admin sets all targets, manages users, resets any password, edits lookups and holidays. Admin only can export.
- No comments feature. No refresh buttons: the screen updates itself.
- Sidebar collapsible. Searchable dropdowns. Date pickers. Loading states. Transitions. Toasts.
- Every phone number is stored normalized (E.164, +966…) and displayed local (05x xxx xxxx). Input accepts 05x, +966, 009665. Duplicate warning matches on normalized phone. (P3)
- Tapping a phone anywhere opens WhatsApp via wa.me; long-press/secondary shows the number. (P3)
- Ctrl+K / Cmd+K opens global search from any screen. (P2)
- The app is installable on a phone (PWA manifest, icons, offline splash only — no offline data). (P7)
- Sessions last 30 days; sign-out is explicit. (P2)
- Every empty list shows one sentence and its primary action. (all)
- List filters and the open drawer are reflected in the URL. (P3+)
- Archive, never delete: companies, contacts, projects get archived_at; archived rows hide from lists and stay in history. Admin can restore. (P3)

## §4 Defaults Claude chose — founder may change

- D1 Lead sources, in order: Field visit · Direct contact · Referral · Exhibition · Marketing · Online · WhatsApp · Other.
- D2 Categories, in order: Factory · Contractor · Advertising · Real estate · Owner · Consultant · Station management · Workshop · Personal · Other.
- D3 Suppliers N, K, C, D: the full name equals the code until the admin types a real one (the founder said the code is the name).
- D4 Fire ratings B1 · A2 · Normal. Classes A · B · A2G1 · A2G2. Thicknesses 3 · 4 · 5 · 6 mm, 4 mm preselected.
- D5 Width chips 1.24 · 1.5 · 2.0 · Other; 1.24 preselected. Length is typed. Colour code is required free text.
- D6 m² and money show two decimals with thousands separators and Western digits in both languages; rounding is half-up per line.
- D7 Countries are the full ISO list in English and Arabic; the six pinned first. Cities are the 171 Saudi cities; the six pinned first. Both searchable in either script.
- D8 Duplicate warning matches a company name (case-insensitive) or a contact phone (digits only; +966 / 00966 / 966 fold to 0) across all reps; it names the company and its rep and never blocks saving.
- D9 A company's next follow-up is set by the latest log entry or by the picker at the top of its drawer. A project has its own. The home strip counts both, plus never-contacted companies older than 14 days; clicking it lists them.
- D10 Quotation numbers are Q-1, Q-2 …; a revision is Q-12/2 and copies every line. Revise is offered on issued, accepted and rejected quotations. A rep may cancel his own quotation while it is requested or returned; nobody cancels an issued one.
- D11 The rep's Customer rejected does not mark the project lost; Mark lost stays a separate action on the project.
- D12 Dispatch numbers are D-1, D-2 …. Shipment method is CT (customer's truck) · TT (Technopanel truck) · Cargo. Destination and payment terms are free text, both required. A dispatch cannot exceed the quotation's remaining quantity per item.
- D13 Notifications are stored as a kind plus parameters and rendered in the reader's language.
- D14 Manager "Stuck": requests waiting more than 2 working days · follow-ups overdue more than 3 days · companies never contacted for more than 14 days.
- D15 Coordinator has no companies of her own; her home is the Queue. Admin sees the manager's home plus an Admin menu.
- D16 Language is saved per user (user menu); theme is saved per browser (cookie), dark by default.
- D17 Passwords are at least 8 characters; sessions last 30 days; deactivating a user ends their sessions at once.
- D18 The first contact added to a company is its main contact; any contact can be made main later.
- D19 Export is three CSV files (companies with main contact, quotations with items, dispatches with items), UTF-8 with BOM so Excel opens Arabic correctly.
- D20 Target card pace compares achieved ÷ target with working days elapsed ÷ working days in the month; behind pace in the first five working days reads "the month has just started".
