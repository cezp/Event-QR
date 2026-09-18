export type Role = "admin" | "event_admin" | "crew";
export type EventStatus = "draft" | "open" | "live" | "closed";
export type InvitationStatus =
  "invited" | "pending" | "approved" | "rejected" | "cancelled";
export interface Staff {
  email: string;
  name: string;
  role: Role;
  eventIds: string[];
  active: boolean;
  principalId?: string;
}
export interface Event {
  id: string;
  name: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  capacity: number;
  createdAt: string;
  version: string;
}
export interface Parent {
  firstName: string;
  lastName: string;
}
export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  everCheckedIn?: boolean;
}
export interface Invitation {
  id: string;
  eventId: string;
  phone: string;
  secondPhone: string;
  email: string;
  maxChildren: number;
  parents: Parent[];
  children: Child[];
  pastAdmissions?: number;
  status: InvitationStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  registrationHash: string;
  qrToken: string;
  version: string;
}
export interface Audit {
  id: string;
  invitationId?: string;
  at: string;
  actor: string;
  action: string;
  reason?: string;
  changes: { field: string; before: unknown; after: unknown }[];
}
export type InvitationView = Omit<Invitation, "registrationHash">;
export interface Profile {
  invitation: InvitationView;
  history: Audit[];
}
export interface Settings {
  paused: boolean;
  message: string;
}
export interface Me {
  user: Staff;
  local: boolean;
}
export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "Szkic",
  open: "Zapisy otwarte",
  live: "W trakcie",
  closed: "Zakończone",
};
export const invitationStatusLabels: Record<InvitationStatus, string> = {
  invited: "Link utworzony",
  pending: "Do weryfikacji",
  approved: "Zaakceptowane",
  rejected: "Odrzucone",
  cancelled: "Anulowane",
};
export const roleLabels: Record<Role, string> = {
  admin: "Administrator",
  event_admin: "Administrator wydarzenia",
  crew: "Obsługa wejścia",
};
