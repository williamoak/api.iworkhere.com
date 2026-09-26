import { welcomePage } from './welcomePage';

export { welcomePage };

export function renderWelcomePage(isAuthenticated: boolean): string {
    return welcomePage(isAuthenticated);
}
