import { Button, InputNumber, Space, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import type { BestFieldRenderContext } from "best-lowcode-runtime";
type Tier = { min?: number; max?: number; price?: number };
type Product = { key: string; label: string; defaultPrice: number };
const products: Product[] = [
  { key: "ethoca", label: "ETHOCA单价（$）", defaultPrice: 25 },
  { key: "rdr", label: "RDR单价（$）", defaultPrice: 15 },
  { key: "cdrn", label: "CDRN单价（$）", defaultPrice: 15 }
];
function normalize(value: unknown): Record<string, Tier[]> {
  const source = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  return Object.fromEntries(
    products.map(({ key, defaultPrice }) => [
      key,
      Array.isArray(source[key])
        ? (source[key] as Tier[])
        : [{ min: 0, max: 99999, price: defaultPrice }, { min: 100000 }]
    ])
  );
}
type SlotProps = Partial<BestFieldRenderContext> & { value?: unknown };
export function TieredPricingSlot({ value, setValue }: SlotProps) {
  const [state, setState] = useState(() => normalize(value));
  useEffect(() => setState(normalize(value)), [value]);
  const update = (key: string, rows: Tier[]) => {
    const next = { ...state, [key]: rows };
    setState(next);
    setValue?.("tiers", next);
  };
  return (
    <div className="tiered-pricing-slot">
      <Typography.Text type="secondary">
        提示：最后一行上限为（无上限），下限自动计算
      </Typography.Text>
      {products.map(({ key, label }) => {
        const rows = state[key] ?? [];
        return (
          <section className="tier-product" key={key}>
            <Typography.Text strong>{label}</Typography.Text>
            <div className="tier-grid">
              {rows.map((row, index) => (
                <Space
                  key={`${key}-${index}`}
                  className="tier-row"
                  align="center">
                  <InputNumber
                    value={row.min}
                    disabled={index > 0}
                    placeholder="下限"
                    onChange={(v) =>
                      update(
                        key,
                        rows.map((r, i) =>
                          i === index ? { ...r, min: v ?? undefined } : r
                        )
                      )
                    }
                  />
                  <span>~</span>
                  {index === rows.length - 1 ? (
                    <span className="tier-unlimited">及以上</span>
                  ) : (
                    <InputNumber
                      value={row.max}
                      placeholder="上限"
                      onChange={(v) =>
                        update(
                          key,
                          rows.map((r, i) =>
                            i === index ? { ...r, max: v ?? undefined } : r
                          )
                        )
                      }
                    />
                  )}
                  <InputNumber
                    value={row.price}
                    placeholder="价格"
                    onChange={(v) =>
                      update(
                        key,
                        rows.map((r, i) =>
                          i === index ? { ...r, price: v ?? undefined } : r
                        )
                      )
                    }
                  />
                </Space>
              ))}
            </div>
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                const previous = rows[rows.length - 1];
                update(key, [
                  ...rows.slice(0, -1),
                  {
                    ...previous,
                    max: previous?.min ? previous.min + 99999 : 99999
                  },
                  { min: (previous?.max ?? 0) + 1 }
                ]);
              }}>
              添加行
            </Button>
          </section>
        );
      })}
    </div>
  );
}
