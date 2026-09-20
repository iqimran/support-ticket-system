-- Postgres sequences are non-transactional and lock-free: concurrent
-- nextval() calls always return distinct values with no explicit locking,
-- which is exactly the guarantee needed for generating unique
-- human-friendly ticket numbers (TKT-000001, TKT-000002, ...) safely under
-- concurrent ticket creation. Gaps on transaction rollback are expected and
-- acceptable for this use case.
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;
