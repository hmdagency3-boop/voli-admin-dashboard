import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
const memberSupabase = supabase;
import { authErrorMessage } from '@/lib/auth-messages';

/**
 * Management panel (the hidden /admin pages). Every call goes to a database function in
 * supabase/009_admin.sql that checks the admin role first, so the rules stay in the database.
 * The panel uses its own sign-in (adminSupabase), separate from the member app's session.
 */

/** The panel's own session (null = signed out of the panel). */
export function useAdminSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

/** Signs in to the panel only. Returns an Arabic error message, or null on success. */
export async function adminSignIn(email: string, password: string): Promise<string | null> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? authErrorMessage(error) : null;
  } catch {
    return 'تعذّر الاتصال، تحقق من الإنترنت وحاول مجدداً';
  }
}

export const adminSignOut = () => supabase.auth.signOut();

/** Display name of whoever is signed in to the panel. */
export async function getAdminName(authId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('display_name').eq('auth_id', authId).maybeSingle();
  return (data as { display_name?: string } | null)?.display_name ?? null;
}

const missing = (code?: string) => code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export type AdminAccess = 'admin' | 'denied' | 'missing';
/** Whether the signed-in member may open the panel ('missing' = update 009 not run yet). */
export async function getAdminAccess(): Promise<AdminAccess> {
  const { data, error } = await supabase.rpc('am_i_admin');
  if (error) return missing(error.code) ? 'missing' : 'denied';
  return data ? 'admin' : 'denied';
}

export type MyBan = { until: string | null; reason: string | null };
/** The signed-in member's active ban, if any. Older databases without update 009 never report one. */
export async function getMyBan(): Promise<MyBan | null> {
  const { data, error } = await memberSupabase.rpc('my_ban');
  if (error) return null;
  const row = (data as MyBan[] | null)?.[0];
  return row ?? null;
}

// ---------- Dashboard ----------
export type Dashboard = {
  members: number; members_today: number; members_week: number; live_rooms: number; in_rooms_now: number;
  coins_balance: number; gifts_today: number; gifts_week: number; vip_active: number; agencies: number;
  pending_applications: number; bans_active: number; days: { day: string; signups: number; gifts: number }[];
};
export const getDashboard = () => rpc<Dashboard>('admin_dashboard');

// ---------- Members ----------
export type MemberFilter = 'all' | 'vip' | 'banned' | 'staff' | 'new';
export type AdminMemberRow = {
  auth_id: string; public_id: number; special_id: string | null; display_name: string; avatar_url: string | null;
  email: string | null; coins: number; vip_level: number; vip_expires_at: string | null; charisma_points: number;
  wealth_points: number; created_at: string; roles: string[]; banned: boolean; ban_until: string | null; total: number;
};
export const MEMBERS_PAGE = 30;
export async function getMembers(query: string, filter: MemberFilter, page: number) {
  const rows = await rpc<AdminMemberRow[]>('admin_members', {
    p_query: query.trim() || null, p_filter: filter, p_limit: MEMBERS_PAGE, p_offset: page * MEMBERS_PAGE,
  });
  return { rows: rows.map((r) => ({ ...r, coins: Number(r.coins), total: Number(r.total) })), total: Number(rows[0]?.total ?? 0) };
}

export type VipGrant = { id: string; level: number; source: string; starts_at: string; expires_at: string | null; coins_paid: number; note: string | null; created_at: string };
export type MemberAction = { action: string; details: Record<string, unknown>; created_at: string; admin_name: string | null };
export type AdminMember = {
  profile: {
    auth_id: string; public_id: number; special_id: string | null; display_name: string; avatar_url: string | null; bio: string | null;
    coins: number; vip_level: number; vip_expires_at: string | null; charisma_points: number; wealth_points: number; created_at: string;
  };
  email: string | null; roles: string[];
  ban: { until: string | null; reason: string | null; created_at: string } | null;
  vip_grants: VipGrant[];
  room: { id: string; name: string; is_live: boolean } | null;
  agency_owned: { id: string; code: number; name: string } | null;
  agency_member: { id: string; code: number; name: string; joined_at: string } | null;
  gifts_sent: number; gifts_received: number; actions: MemberAction[];
};
export const getMember = (id: string) => rpc<AdminMember>('admin_member', { p_auth: id });

export const changeCoins = (id: string, amount: number, note?: string) =>
  rpc<number>('admin_member_coins', { p_auth: id, p_amount: amount, p_note: note || null });
export const grantVip = (id: string, level: number, days: number | null, source: 'admin' | 'gift' | 'event', note?: string) =>
  rpc<string>('admin_member_vip', { p_auth: id, p_level: level, p_days: days, p_source: source, p_note: note || null });
export const revokeVip = (id: string) => rpc<number>('admin_member_vip_revoke', { p_auth: id });
export const setSpecialId = (id: string, special: string | null) => rpc<void>('admin_member_special_id', { p_auth: id, p_special: special });
export const setRole = (id: string, role: 'admin' | 'moderator', enabled: boolean) =>
  rpc<void>('admin_member_role', { p_auth: id, p_role: role, p_enabled: enabled });
export const editProfile = (id: string, p: { name?: string; clearAvatar?: boolean; clearBio?: boolean }) =>
  rpc<void>('admin_member_profile', { p_auth: id, p_display_name: p.name || null, p_clear_avatar: !!p.clearAvatar, p_clear_bio: !!p.clearBio });
/** Returns whether new sign-ins are blocked too. */
export const banMember = (id: string, days: number | null, reason?: string) =>
  rpc<boolean>('admin_member_ban', { p_auth: id, p_days: days, p_reason: reason || null });
export const unbanMember = (id: string) => rpc<void>('admin_member_unban', { p_auth: id });

// ---------- Rooms ----------
export type AdminRoom = {
  id: string; name: string; owner_id: string; owner_public_id: number; owner_name: string; owner_avatar: string | null;
  is_live: boolean; locked: boolean; mode: string; seat_count: number; present: number; coins_total: number; created_at: string; updated_at: string;
};
export async function getRooms(query: string, liveOnly: boolean) {
  const rows = await rpc<AdminRoom[]>('admin_rooms', { p_query: query.trim() || null, p_live_only: liveOnly });
  return rows.map((r) => ({ ...r, present: Number(r.present), coins_total: Number(r.coins_total) }));
}
export const closeRoom = (id: string) => rpc<void>('admin_close_room', { p_room: id });
export const clearRoomChat = (id: string) => rpc<void>('admin_clear_room_chat', { p_room: id });

// ---------- Gifts and VIP prices ----------
export type AdminGift = {
  key: string; name: string; price: number; sort: number; active: boolean;
  /** Picture uploaded from the panel; null = the picture built into the app (original 8 gifts, or before update 013). */
  art_url: string | null; sent_count: number; sent_value: number;
};
export async function getGifts() {
  const rows = await rpc<AdminGift[]>('admin_gifts');
  return rows.map((g) => ({ ...g, art_url: g.art_url ?? null, price: Number(g.price), sent_count: Number(g.sent_count), sent_value: Number(g.sent_value) }));
}
export const updateGift = (g: Pick<AdminGift, 'key' | 'name' | 'price' | 'sort' | 'active'>) =>
  rpc<void>('admin_update_gift', { p_key: g.key, p_name: g.name, p_price: g.price, p_sort: g.sort, p_active: g.active });

/** Gift pictures: PNG / WebP / GIF / JPEG up to 5 MB (same limits as the gift-art bucket in sql/013_gift_uploads.sql). */
export const GIFT_ART_TYPES = ['image/png', 'image/webp', 'image/gif', 'image/jpeg'];
export const GIFT_ART_MAX = 5 * 1024 * 1024;
export function giftArtProblem(file: { type: string; size: number }): string | null {
  if (!GIFT_ART_TYPES.includes(file.type)) return 'الصورة لازم تكون PNG أو WebP أو GIF أو JPG';
  if (file.size > GIFT_ART_MAX) return 'حجم الصورة أكبر من 5 ميجا';
  return null;
}

/** Uploads a gift picture to the public gift-art bucket and returns its link. */
export async function uploadGiftArt(file: File): Promise<string> {
  const problem = giftArtProblem(file);
  if (problem) throw Object.assign(new Error(problem), { hint: 'bad_art_file' });
  const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/jpeg': 'jpg' } as Record<string, string>)[file.type];
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('gift-art').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw Object.assign(error, { hint: 'upload_failed' });
  return supabase.storage.from('gift-art').getPublicUrl(path).data.publicUrl;
}

/** Adds a new gift (shown in the app right away). Returns its key. */
export async function createGift(g: { name: string; price: number; sort?: number | null; file: File }) {
  const art = await uploadGiftArt(g.file);
  return rpc<string>('admin_create_gift', { p_name: g.name, p_price: g.price, p_sort: g.sort ?? null, p_art_url: art });
}
export async function changeGiftArt(key: string, file: File) {
  const art = await uploadGiftArt(file);
  return rpc<void>('admin_set_gift_art', { p_key: key, p_art_url: art });
}

export type VipTierPrice = { level: number; name_ar: string; price_coins: number | null; duration_days: number; monthly_salary_coins: number | null };
export async function getVipPrices(): Promise<VipTierPrice[]> {
  const { data, error } = await supabase.from('vip_tiers').select('level, name_ar, price_coins, duration_days, monthly_salary_coins').order('level');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    level: Number(t['level']), name_ar: String(t['name_ar']), duration_days: Number(t['duration_days']),
    price_coins: t['price_coins'] == null ? null : Number(t['price_coins']),
    monthly_salary_coins: t['monthly_salary_coins'] == null ? null : Number(t['monthly_salary_coins']),
  }));
}
export const updateVipPrice = (t: VipTierPrice) => rpc<void>('admin_update_vip_tier', {
  p_level: t.level, p_price_coins: t.price_coins, p_duration_days: t.duration_days, p_monthly_salary_coins: t.monthly_salary_coins,
});

// ---------- Agencies ----------
export type AdminAgency = {
  id: string; code: number; name: string; owner_id: string; owner_public_id: number; owner_name: string; owner_avatar: string | null;
  commission_percent: number | null; members: number; income_week: number; created_at: string;
};
export async function getAgencies(query: string) {
  const rows = await rpc<AdminAgency[]>('admin_agencies', { p_query: query.trim() || null });
  return rows.map((a) => ({ ...a, members: Number(a.members), income_week: Number(a.income_week),
    commission_percent: a.commission_percent == null ? null : Number(a.commission_percent) }));
}
export const updateAgency = (id: string, name: string, commission: number | null) =>
  rpc<void>('admin_update_agency', { p_id: id, p_name: name, p_commission: commission });
export type AgencyHost = { host_id: string; public_id: number; display_name: string; avatar_url: string | null; joined_at: string; income_week: number };
export async function getAgencyHosts(agency: string) {
  const rows = await rpc<AgencyHost[]>('admin_agency_members', { p_agency: agency });
  return rows.map((h) => ({ ...h, income_week: Number(h.income_week) }));
}
export const removeAgencyHost = (agency: string, host: string) => rpc<void>('admin_remove_agency_host', { p_agency: agency, p_host: host });

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export type AgencyApplication = {
  id: string; applicant_id: string; agency_name: string; full_name: string; phone: string; country: string; note: string | null;
  status: ApplicationStatus; reject_reason: string | null; created_at: string; code: number | null;
};
export const getApplications = (status: ApplicationStatus) => rpc<AgencyApplication[]>('admin_agency_applications', { p_status: status });
export const reviewApplication = (id: string, approve: boolean, reason?: string) =>
  rpc<number | null>('admin_review_application', { p_id: id, p_approve: approve, p_reason: reason || null });

// ---------- Official notices (Voli Helper chat, ID 100 — sql/014_admin_grant_notices.sql) ----------
// The database sends these automatically when VIP, a role, coins or a special ID is given;
// the same wording is built here for previews and for notices sent by hand.
const GIFT_PREFIX = 'Congratulations on receiving the official gift of ';
const validity = (days?: number | null) => (days && days > 0 ? ` ,valid for ${days} days.` : '.');

/** "Congratulations on receiving the official gift of {what}[ ,valid for N days]." */
export const giftNotice = (what: string, days?: number | null) => `${GIFT_PREFIX}${what.trim()}${validity(days)}`;
export const headwearNotice = (name: string, days?: number | null) => giftNotice(`Headwear ${name.trim()}`, days);
export const vipHeadwearNotice = (level: number, days?: number | null) => headwearNotice(`vip ${level}`, days);
export const vipUpgradeNotice = (level: number, days?: number | null) => `Congratulations on your upgrade to VIP${level}${validity(days)}`;
/** Both messages a member receives when given VIP, in the order they arrive. */
export const vipGrantNotices = (level: number, days?: number | null) => [vipUpgradeNotice(level, days), vipHeadwearNotice(level, days)];
export const roleNotice = (role: 'admin' | 'moderator') => headwearNotice(role === 'admin' ? 'Super Admin' : 'Moderator');
/** Only added coins get a message (removing coins sends nothing). */
export const coinsNotice = (amount: number) => (amount > 0 ? giftNotice(`${Math.trunc(amount)} Coins`) : null);
export const specialIdNotice = (id: string) => `Congratulations on receiving your Special ID: ${id.trim()}.`;

export type NoticeTemplate = 'super_admin' | 'moderator' | 'vip_headwear' | 'vip_upgrade' | 'headwear' | 'gift' | 'custom';
export type NoticeInput = { template?: NoticeTemplate; level?: number; days?: number | null; name?: string; text?: string };
/** The message a hand-sent notice will carry, or null while the form is incomplete. */
export function buildNotice(v: NoticeInput): string | null {
  const days = v.days ?? null, name = v.name?.trim() ?? '';
  switch (v.template) {
    case 'super_admin': return roleNotice('admin');
    case 'moderator': return roleNotice('moderator');
    case 'vip_headwear': return v.level ? vipHeadwearNotice(v.level, days) : null;
    case 'vip_upgrade': return v.level ? vipUpgradeNotice(v.level, days) : null;
    case 'headwear': return name ? headwearNotice(name, days) : null;
    case 'gift': return name ? giftNotice(name, days) : null;
    case 'custom': return v.text?.trim() || null;
    default: return null;
  }
}

/** Sends an official notice from Voli Helper to the member's chat. */
export async function sendAdminNotice(authId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_send_notice', { p_recipient: authId, p_body: body });
  if (error) throw missing(error.code) ? { hint: 'notice_missing' } : error;
  return data as string;
}

// ---------- Log ----------
export type LogRow = {
  id: string; created_at: string; action: string; details: Record<string, unknown>;
  admin_name: string | null; admin_public_id: number | null; target_id: string | null; target_name: string | null; target_public_id: number | null;
};
export const LOG_PAGE = 50;
export const getLog = (page: number) => rpc<LogRow[]>('admin_actions_log', { p_limit: LOG_PAGE, p_offset: page * LOG_PAGE });

export const ACTION_LABELS: Record<string, string> = {
  coins: 'عملات', vip_grant: 'منح VIP', vip_revoke: 'سحب VIP', special_id: 'ID مميز', role: 'صلاحية',
  profile: 'تعديل بيانات', ban: 'حظر', unban: 'فك حظر', room_close: 'إغلاق غرفة', room_chat_clear: 'مسح محادثة غرفة',
  gift_update: 'تعديل هدية', gift_create: 'إضافة هدية', gift_art: 'صورة هدية', vip_tier_update: 'سعر VIP', agency_update: 'تعديل وكالة', agency_remove_host: 'إزالة مضيف من وكالة',
  agency_approve: 'قبول وكالة', agency_reject: 'رفض وكالة', notice: 'إشعار رسمي',
};

/** One-line Arabic summary of what an action changed. */
export function describeAction(action: string, d: Record<string, unknown>): string {
  const n = (k: string) => Number(d[k] ?? 0).toLocaleString('en');
  switch (action) {
    case 'coins': return `${Number(d['amount']) > 0 ? '+' : ''}${n('amount')} (الرصيد ${n('balance')})${d['note'] ? ` — ${d['note']}` : ''}`;
    case 'vip_grant': return `VIP ${d['level']} ${d['days'] ? `لمدة ${d['days']} يوم` : 'دائم'}`;
    case 'vip_revoke': return `انتهى ${n('ended')}`;
    case 'special_id': return d['to'] ? `أصبح ${d['to']}` : 'أُزيل';
    case 'role': return `${d['role'] === 'admin' ? 'إدارة عليا' : 'مشرف'}: ${d['enabled'] ? 'أُضيف' : 'أُزيل'}`;
    case 'ban': return `${d['days'] ? `${d['days']} يوم` : 'نهائي'}${d['reason'] ? ` — ${d['reason']}` : ''}`;
    case 'gift_update': return `${d['key']}: ${n('price')}${d['active'] === false ? ' (مخفية)' : ''}`;
    case 'gift_create': return `${d['name']}: ${n('price')}`;
    case 'gift_art': return String(d['key'] ?? '');
    case 'vip_tier_update': return `VIP ${d['level']}: ${d['price'] == null ? 'غير معروض للبيع' : n('price')} / ${d['days']} يوم`;
    case 'agency_update': return `${d['name']}${d['commission'] != null ? ` — ${d['commission']}%` : ''}`;
    case 'agency_approve': return `كود ${d['code']}`;
    case 'agency_reject': return d['reason'] ? String(d['reason']) : '';
    case 'notice': return String(d['body'] ?? '');
    default: return '';
  }
}

export const adminErrorMessage = (e: unknown) => {
  const err = e as { hint?: string; code?: string; message?: string } | null;
  if (err?.hint === 'notice_missing') return 'يجب تشغيل ملف الإشعارات 014 في قاعدة البيانات أولاً';
  if (missing(err?.code)) return 'يجب تشغيل ملف الإدارة 009 في قاعدة البيانات أولاً';
  if (err?.hint === 'bad_art_file') return err.message ?? 'الصورة غير صالحة';
  if (err?.hint === 'upload_failed') return /bucket/i.test(err.message ?? '')
    ? 'يجب تشغيل ملف الهدايا 013 في قاعدة البيانات أولاً' : 'تعذّر رفع الصورة، حاول مجدداً';
  return ({
    not_admin: 'هذا الإجراء متاح للإدارة العليا فقط',
    not_found: 'العنصر غير موجود',
    bad_amount: 'المبلغ غير صحيح',
    negative_balance: 'لا يمكن أن يقل الرصيد عن الصفر',
    bad_level: 'مستوى VIP غير صحيح',
    bad_days: 'عدد الأيام غير صحيح',
    bad_source: 'نوع المنح غير صحيح',
    bad_special_id: 'ID المميز أرقام فقط ولا يبدأ بصفر (حتى 10 أرقام)',
    special_id_taken: 'هذا الرقم مستخدم ID لعضو آخر',
    self: 'لا يمكنك تنفيذ هذا الإجراء على نفسك',
    target_admin: 'لا يمكن حظر أحد أعضاء الإدارة العليا',
    bad_name: 'الاسم غير صحيح',
    bad_notice: 'نص الإشعار مطلوب (حتى 1000 حرف)',
    bad_price: 'السعر غير صحيح',
    bad_art: 'صورة الهدية غير صحيحة، ارفع الصورة من اللوحة',
    bad_percent: 'يجب أن تكون النسبة بين 0 و100',
    is_agent: 'لا يمكن إزالة الوكيل من وكالته',
    not_pending: 'تمت معالجة هذا الطلب مسبقاً',
    already_agent: 'صاحب الطلب وكيل بالفعل',
    in_agency: 'انضم صاحب الطلب إلى وكالة أخرى',
  } as Record<string, string>)[err?.hint ?? ''] ?? 'حدث خطأ، يُرجى المحاولة مرة أخرى';
};

export const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en'));
export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtDay = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('ar-EG', { dateStyle: 'medium' }) : '—');
