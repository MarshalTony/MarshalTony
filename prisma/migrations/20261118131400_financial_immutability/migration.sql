-- Completed financial transactions must never be modified or deleted.
-- Corrections are made with reversal / adjustment records instead.

CREATE OR REPLACE FUNCTION smis_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Records in table "%" are immutable. Use an authorised reversal or adjustment instead.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION smis_block_mutation();
CREATE TRIGGER payment_immutable BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION smis_block_mutation();
CREATE TRIGGER payment_reversal_immutable BEFORE UPDATE OR DELETE ON "PaymentReversal"
  FOR EACH ROW EXECUTE FUNCTION smis_block_mutation();
CREATE TRIGGER fee_adjustment_immutable BEFORE UPDATE OR DELETE ON "FeeAdjustment"
  FOR EACH ROW EXECUTE FUNCTION smis_block_mutation();
CREATE TRIGGER invoice_immutable BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION smis_block_mutation();
CREATE TRIGGER invoice_line_immutable BEFORE UPDATE OR DELETE ON "InvoiceLine"
  FOR EACH ROW EXECUTE FUNCTION smis_block_mutation();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION smis_block_mutation();

-- Sanity constraints
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_positive CHECK (amount > 0);
ALTER TABLE "FeeAdjustment" ADD CONSTRAINT adjustment_amount_positive CHECK (amount > 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_one_sided CHECK (debit >= 0 AND credit >= 0 AND (debit > 0) <> (credit > 0));
ALTER TABLE "Mark" ADD CONSTRAINT mark_score_nonnegative CHECK (score IS NULL OR score >= 0);
ALTER TABLE "Term" ADD CONSTRAINT term_number_range CHECK (number BETWEEN 1 AND 3);

-- Only one current academic year / term
CREATE UNIQUE INDEX one_current_year ON "AcademicYear" ("isCurrent") WHERE "isCurrent";
CREATE UNIQUE INDEX one_current_term ON "Term" ("isCurrent") WHERE "isCurrent";
