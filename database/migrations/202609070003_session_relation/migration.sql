-- The composite FK already verifies both membership and user. Remove the weaker redundant FK.
ALTER TABLE user_sessions DROP CONSTRAINT user_sessions_membership_id_fkey;
