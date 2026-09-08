import { BestProvider, BestTabbedPage } from "best-lowcode-runtime";
import "best-lowcode-runtime/style.css";
import { balanceWarningRegistry } from "./registry";
import { balanceWarningTabsSchema } from "./schema";

export function CustomerBalanceWarningPage() {
  return (
    <BestProvider registry={balanceWarningRegistry}>
      <div className="balance-alert-page">
        <BestTabbedPage schema={balanceWarningTabsSchema} />
      </div>
    </BestProvider>
  );
}
