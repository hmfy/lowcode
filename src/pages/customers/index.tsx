import { BestCrudPage, BestProvider } from "best-lowcode-runtime";
import "best-lowcode-runtime/style.css";
import { customerSchema } from "./schema";
import { customerRegistry } from "./registry";
export function CustomersPage() {
  return (
    <BestProvider registry={customerRegistry}>
      <BestCrudPage schema={customerSchema} />
    </BestProvider>
  );
}
