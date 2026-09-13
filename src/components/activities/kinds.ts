import {
  Ellipsis,
  HardHat,
  MapPin,
  MessageCircle,
  Phone,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Channel } from "@/db/schema";

/**
 * What happened, as a picture beside its word (SPEC §3 P13: "chooses what
 * happened from buttons — visit, call, WhatsApp, meeting, site visit").
 *
 * A record keyed by the column's own union, so a seventh kind added to
 * `CHANNELS` fails the typecheck here until it has an icon — this is not a
 * second list of the kinds, it is a picture for each member of the one list
 * (rules/words.md). Its keys are in the order the popup offers them: the three a
 * rep does most, then the two that take an appointment, then the rest.
 */
export const KIND_ICON: Record<Channel, LucideIcon> = {
  visit: MapPin,
  call: Phone,
  whatsapp: MessageCircle,
  meeting: Users,
  siteVisit: HardHat,
  other: Ellipsis,
};

/** The kinds in the order a person is offered them. */
export const KINDS = Object.keys(KIND_ICON) as Channel[];
