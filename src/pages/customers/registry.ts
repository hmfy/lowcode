import type { BestRegistry } from "best-lowcode-runtime";
import { createElement } from "react";
import {
  detailCustomer,
  listCustomers,
  createCustomer,
  updateCustomer,
  removeCustomer,
  toggleCustomer,
  resetCustomerPassword,
  searchUsers
} from "./adapter";
import { TieredPricingSlot } from "./TieredPricingSlot";
export const customerRegistry: Partial<BestRegistry> = {
  slots: { "customer.tieredPricing": (context) => createElement(TieredPricingSlot, context as never) },
  listServices: { "customer.list": listCustomers },
  services: {
    "customer.detail": detailCustomer,
    "customer.create": createCustomer,
    "customer.update": updateCustomer,
    "customer.remove": removeCustomer,
    "user.search": searchUsers
  },
  actions: { "customer.toggleStatus": async (context) => { await toggleCustomer(context); }, "customer.resetPassword": async (context) => { await resetCustomerPassword(context); } },
  dictionaries: {
    status: [
      { label: "全部", value: "" },
      { label: "启用", value: "enabled" },
      { label: "禁用", value: "disabled" }
    ],
    tags: [
      { label: "全部", value: "" },
      { label: "战略伙伴", value: "strategic_partner" },
      { label: "优质客户", value: "premium" },
      { label: "成长客户", value: "growth" },
      { label: "散客", value: "retail" }
    ],
    sources: [
      { label: "全部", value: "" },
      { label: "市场开发", value: "market_development" },
      { label: "公司内部介绍", value: "internal_referral" },
      { label: "业务介绍", value: "business_referral" },
      { label: "自填", value: "self_registered" }
    ],
    channels: [
      { label: "线上推广", value: "online" },
      { label: "合作伙伴", value: "partner" }
    ],
    pricingModes: [
      { label: "固定价格", value: "fixed" },
      { label: "阶梯价格", value: "tiered" }
    ],
    boolean: [
      { label: "关闭", value: "false" },
      { label: "开启", value: "true" }
    ]
  }
};
