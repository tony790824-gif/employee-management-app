-- This security fix is deliberately retained during rollback. Reintroducing
-- ambiguous authorization expressions would make the 0004 API unusable.
SELECT 1;
