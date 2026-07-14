application_origins: table
columns:
id: uuid NN default gen_random_uuid()
application_id: uuid NN
origin: text NN
type: text NN
is_enabled: boolean NN default true
created_at: timestamp with time zone NN default now()
updated_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
application_origins_app_origin_type_unique: unique (application_id, origin, type)
+ keys
#1: PK (id) (underlying index #1)
application_origins_app_origin_type_unique: AK (application_id, origin, type)
+ foreign-keys
application_origins_application_id_applications_id_fk: foreign key (application_id) -> applications (id)

applications: table
columns:
id: uuid NN default gen_random_uuid()
app_key: text NN
name: text NN
description: text
is_enabled: boolean NN default true
created_at: timestamp with time zone NN default now()
updated_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
applications_app_key_unique: unique (app_key)
+ keys
#1: PK (id) (underlying index #1)
applications_app_key_unique: AK (app_key)

auth_tokens: table
columns:
id: uuid NN default gen_random_uuid()
user_id: uuid NN
application_id: uuid NN
token_type: text NN
token_hash: text NN
expires_at: timestamp with time zone NN
revoked_at: timestamp with time zone
replaced_by_token_id: uuid
created_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
auth_tokens_user_app_idx: index (user_id, application_id)
auth_tokens_token_hash_idx: index (token_hash)
+ keys
#1: PK (id) (underlying index #1)
+ foreign-keys
auth_tokens_user_id_users_id_fk: foreign key (user_id) -> users (id)
auth_tokens_application_id_applications_id_fk: foreign key (application_id) -> applications (id)
auth_tokens_replaced_by_token_id_auth_tokens_id_fk: foreign key (replaced_by_token_id) -> auth_tokens (id)

config: table
columns:
id: uuid NN
name: text NN
value: jsonb NN
version: numeric(5,2) NN
created_at: timestamp with time zone NN default now()
updated_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
config_name_version_unique: unique (name, version)
config_name_version_idx: index (name, version)
config_name_idx: index (name)
+ keys
#1: PK (id) (underlying index #1)
config_name_version_unique: AK (name, version)

email_audit_logs: table
columns:
id: uuid NN
user_id: uuid
email: text NN
email_type: text NN
status: text NN
error_message: text
created_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
+ keys
#1: PK (id) (underlying index #1)
+ foreign-keys
email_audit_logs_user_id_users_id_fk: foreign key (user_id) -> users (id) d:cascade

email_verification_tokens: table
columns:
id: uuid NN
user_id: uuid NN
token_hash: text NN
expires_at: timestamp with time zone
created_at: timestamp with time zone NN default now()
application_id: uuid NN
+ indices
#1: unique (id)
email_verification_tokens_token_hash_unique: unique (token_hash)
+ keys
#1: PK (id) (underlying index #1)
email_verification_tokens_token_hash_unique: AK (token_hash)
+ foreign-keys
email_verification_tokens_user_id_users_id_fk: foreign key (user_id) -> users (id) d:cascade
email_verification_tokens_application_id_applications_id_fk: foreign key (application_id) -> applications (id) d:cascade

modules: table
columns:
mod_id: uuid NN default gen_random_uuid()
name: text NN
polarity: text
capacity: bigint
type: text NN
slot_type: module_slot_type NN
description: text
max_rank: bigint
current_rank: bigint
rank_upgrades: jsonb
locked: jsonb
modify: jsonb
grade: text
owner_id: text
+ indices
#1: unique (mod_id)
+ keys
#1: PK (mod_id) (underlying index #1)

password_reset_requests: table
columns:
id: uuid NN default gen_random_uuid()
user_id: uuid NN
challenge: text NN
response_hash: text NN
verified_at: timestamp with time zone
email_token_hash: text
expires_at: timestamp with time zone NN
used_at: timestamp with time zone
created_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
password_reset_requests_user_idx: index (user_id)
password_reset_requests_email_token_idx: index (email_token_hash)
+ keys
#1: PK (id) (underlying index #1)
+ foreign-keys
password_reset_requests_user_id_users_id_fk: foreign key (user_id) -> users (id)

password_reset_tokens: table
columns:
id: uuid NN
user_id: uuid NN
token_hash: text NN
expires_at: timestamp with time zone
created_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
password_reset_tokens_token_hash_unique: unique (token_hash)
+ keys
#1: PK (id) (underlying index #1)
password_reset_tokens_token_hash_unique: AK (token_hash)
+ foreign-keys
password_reset_tokens_user_id_users_id_fk: foreign key (user_id) -> users (id) d:cascade

user_applications: table
columns:
id: uuid NN default gen_random_uuid()
user_id: uuid NN
application_id: uuid NN
role: text NN
is_enabled: boolean NN default true
created_at: timestamp with time zone NN default now()
updated_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
user_applications_user_application_unique: unique (user_id, application_id)
+ keys
#1: PK (id) (underlying index #1)
user_applications_user_application_unique: AK (user_id, application_id)
+ foreign-keys
user_applications_user_id_users_id_fk: foreign key (user_id) -> users (id)
user_applications_application_id_applications_id_fk: foreign key (application_id) -> applications (id)

user_auth_local: table
columns:
user_id: uuid NN
password_hash: text NN
is_enabled: boolean NN default true
created_at: timestamp with time zone NN default now()
updated_at: timestamp with time zone NN default now()
+ indices
#1: unique (user_id)
user_auth_local_user_idx: index (user_id)
+ keys
#1: PK (user_id) (underlying index #1)
+ foreign-keys
user_auth_local_user_id_users_id_fk: foreign key (user_id) -> users (id) d:cascade

user_auth_oauth: table
columns:
id: uuid NN
user_id: uuid NN
provider: text NN
provider_account_id: text NN
email: text
email_verified: boolean NN default false
created_at: timestamp with time zone NN default now()
updated_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
user_auth_oauth_user_provider_idx: unique (user_id, provider)
user_auth_oauth_provider_account_idx: unique (provider, provider_account_id)
user_auth_oauth_user_idx: index (user_id)
+ keys
#1: PK (id) (underlying index #1)
user_auth_oauth_user_provider_idx: AK (user_id, provider)
user_auth_oauth_provider_account_idx: AK (provider, provider_account_id)
+ foreign-keys
user_auth_oauth_user_id_users_id_fk: foreign key (user_id) -> users (id) d:cascade

user_password_history: table
columns:
id: uuid NN default gen_random_uuid()
user_id: uuid NN
password_hash: text NN
created_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
user_password_history_user_idx: index (user_id)
+ keys
#1: PK (id) (underlying index #1)
+ foreign-keys
user_password_history_user_id_users_id_fk: foreign key (user_id) -> users (id)

user_statuses: table
columns:
status_code: text NN
description: text NN
+ indices
#1: unique (status_code)
+ keys
#1: PK (status_code) (underlying index #1)

users: table
columns:
id: uuid NN
username: text NN
email: text
status_code: text NN
email_verified_at: timestamp with time zone
created_at: timestamp with time zone NN default now()
updated_at: timestamp with time zone NN default now()
+ indices
#1: unique (id)
#2: unique (username)
#3: unique (email)
+ keys
#1: PK (id) (underlying index #1)
#2: AK (username) (underlying index #2)
#3: AK (email) (underlying index #3)
+ foreign-keys
#1: foreign key (status_code) -> user_statuses (status_code)

warframe_weapons: table
columns:
weapon_id: uuid NN default gen_random_uuid()
name: text NN
class: text NN
description: text
weapon_mods: jsonb
grade: text
owner_id: text
+ indices
#1: unique (weapon_id)
+ keys
#1: PK (weapon_id) (underlying index #1)

warframes: table
columns:
warframe_id: uuid NN default gen_random_uuid()
name: text NN
class: warframe_class NN
lore: text
base_health: double precision
effective_health: double precision
base_shield: double precision
effective_shield: double precision
base_armour: double precision
effective_armour: double precision
base_energy: double precision
effective_energy: double precision
base_ability_strength: double precision
effective_ability_strength: double precision
base_range: double precision
effective_range: double precision
base_duration: double precision
effective_duration: double precision
base_ability_efficiency: double precision
effective_ability_efficiency: double precision
base_sprint_speed: double precision
effective_sprint_speed: double precision
base_capacity: double precision
effective_capacity: double precision
max_passives: bigint
current_passives: jsonb
max_abilities: bigint
current_abilities: jsonb
max_mods: bigint
current_mods: jsonb
max_aura_mods: bigint
current_aura_mods: jsonb
max_exilus_mods: bigint
current_exilus_mods: jsonb
max_arcanes: bigint
current_arcanes: jsonb
max_shards: bigint
current_shards: jsonb
weapons_loadout: jsonb
grade: text
owner_id: text
+ indices
warframe_pkey: unique (warframe_id)
warframes_name_class_uidx: unique (name, class)
+ keys
warframe_pkey: PK (warframe_id)
warframes_name_class_uidx: AK (name, class)
