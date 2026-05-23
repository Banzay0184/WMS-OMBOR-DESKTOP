import { formatMoney, formatSalePaymentLabel, shouldShowBalancePaymentAmount } from "./posApi";

const SalePaymentLabel = ({ sale, className = "text-muted", balanceClassName = "text-xs text-emerald-700 tabular-nums" }) => {
  if (!sale) return <span className={className}>—</span>;

  const prepApplied = Number(sale.prepayment_applied || 0);
  const showBalanceAmount = shouldShowBalancePaymentAmount(sale);

  return (
    <div>
      <div className={className}>{formatSalePaymentLabel(sale)}</div>
      {showBalanceAmount ? (
        <div className={balanceClassName}>{formatMoney(prepApplied)} с баланса</div>
      ) : null}
    </div>
  );
};

export default SalePaymentLabel;
