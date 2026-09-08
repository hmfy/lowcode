import type { BestListService, BestService } from "best-lowcode-runtime";
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
      authorization: import.meta.env.VITE_ADMIN_TOKEN
    }
  });
  const b = (await r.json()) as { code: number; msg?: string; data: T };
  if (!r.ok || b.code !== 0) throw new Error(b.msg || "请求失败");
  return b.data;
}
const sourceLabels: Record<string, string> = { market_development: "市场开发", internal_referral: "公司内部介绍", business_referral: "业务介绍", self_registered: "自填" };
export const listCustomers: BestListService = async ({
  page,
  pageSize,
  filters
}) => {
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize)
  });
  Object.entries(filters).forEach(
    ([k, v]) => v && q.set(k === "id" ? "merchant_id" : k, String(v))
  );
  const d = await request<{ total: number; list: Record<string, unknown>[] }>(
    `/api/admin/v1/customers?${q}`
  );
  return {
    total: d.total,
    items: d.list.map((x) => ({
      ...x,
      sourceText: [x.source_detail, sourceLabels[String(x.source)] ?? x.source].filter(Boolean).join(" · "),
      currency: x.balance_currency,
      balance: Number(x.available_amount ?? 0),
      available: Number(x.available_amount ?? 0),
      authorized: x.active_descriptor_count,
      createdAt: x.created_at
    }))
  };
};
export const detailCustomer: BestService = async ({ id }) => {
  const x = await request<Record<string, unknown>>(
    `/api/admin/v1/customers/${id}`
  );
  return {
    ...x,
    pricingMode: x.pricing_type,
    sourceDescription: x.source_detail,
    sourceChannel: x.source_detail,
    sourcePerson: x.source_detail,
    notify: x.enable_feishu
  };
};
const rules = (v: unknown, f?: unknown) =>
  Array.isArray(v) && v.length
    ? v.map((x: any) => ({
        pricing: Number(x.price ?? x.pricing ?? 0).toFixed(2),
        min_alert_count: x.min ?? x.min_alert_count ?? null,
        max_alert_count: x.max ?? x.max_alert_count ?? null
      }))
    : [
        {
          pricing: Number(f ?? 0).toFixed(2),
          min_alert_count: null,
          max_alert_count: null
        }
      ];
function payload(v: Record<string, unknown>, update = false) {
  const t = (v.tiers ?? {}) as Record<string, unknown>;
  return {
    ...(update
      ? { id: v.id }
      : { name: v.name, email: v.email, password: v.password }),
    pricing_type: v.pricingMode,
    tag: v.tag,
    source: v.source,
    source_detail:
      v.sourcePerson ?? v.sourceChannel ?? v.sourceDescription ?? "",
    enable_feishu: v.notify === true,
    ethoca_values:
      v.pricingMode === "tiered"
        ? rules((t as any).ethoca)
        : rules(undefined, v.ethocaPrice),
    rdr_values:
      v.pricingMode === "tiered"
        ? rules((t as any).rdr)
        : rules(undefined, v.rdrPrice),
    cdrn_values:
      v.pricingMode === "tiered"
        ? rules((t as any).cdrn)
        : rules(undefined, v.cdrnPrice)
  };
}
export const createCustomer: BestService = async (v) =>
  request("/api/admin/v1/customers/register", {
    method: "POST",
    body: JSON.stringify(payload(v))
  });
export const updateCustomer: BestService = async (v) =>
  request("/api/admin/v1/customers/update", {
    method: "POST",
    body: JSON.stringify(payload(v, true))
  });
export const removeCustomer: BestService = async () => ({ ok: true });
export const toggleCustomer: BestService = async ({ record }: any) =>
  request(`/api/admin/v1/customers/${record?.id}/status`, {
    method: "POST",
    body: JSON.stringify({
      status: record?.status === "enabled" ? "disabled" : "enabled"
    })
  });
export const resetCustomerPassword: BestService = async ({ record }: any) =>
  request(`/api/admin/v1/customers/${record?.id}/default-user-pwd`, {
    method: "POST",
    body: JSON.stringify({ password: "Abcd1234" })
  });
export const searchUsers: BestService = async ({ keyword }) =>
  String(keyword ?? "").trim()
    ? request(
        `/api/admin/v1/customers/salesman?keyword=${encodeURIComponent(String(keyword))}`
      )
    : [];
export const getCustomerOptions: BestService = async () =>
  request("/api/admin/v1/customers/simple-list");
