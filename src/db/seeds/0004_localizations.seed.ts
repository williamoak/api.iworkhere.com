import { logger } from '@helpers/logger';
import { db } from '@services/dbService';

/**
 * Seed default localizations (English and French)
 * CockroachDB UPSERT
 */
await db.execute(`
    UPSERT INTO localizations (slug, lang, language_name, text, codepage, direction, description) VALUES
        ('username', 'eng', 'English', 'Enter your username', 'UTF-8', 'ltr', 'Prompt asking user to enter their username'),
        ('username', 'fr', 'French', 'nom d''utilisateur', 'UTF-8', 'ltr', 'Invite demandant à l''utilisateur d''entrer son nom d''utilisateur')
`);

logger.log('🌱 localizations seed executed');
