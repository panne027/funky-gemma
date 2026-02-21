import type { ToolResult } from '../../../types';
import { aiLog } from '../../logging/AILogger';
import { googleAuth } from '../../auth/GoogleAuthService';

export async function handleGetShoppingList(
  _args: Record<string, unknown>,
): Promise<ToolResult> {
  if (!googleAuth.isSignedIn) {
    return {
      success: false,
      tool_name: 'get_shopping_list',
      data: {},
      error: 'Not signed in to Google. User needs to sign in first.',
    };
  }

  try {
    const { getShoppingItems } = require('../../auth/GoogleAPIClient');
    const items = await getShoppingItems();

    aiLog('agent', `Shopping list: ${items.length} items`);

    return {
      success: true,
      tool_name: 'get_shopping_list',
      data: {
        item_count: items.length,
        items: items.map((t: any) => ({
          title: t.title,
          notes: t.notes,
          status: t.status,
        })),
      },
    };
  } catch (err) {
    return {
      success: false,
      tool_name: 'get_shopping_list',
      data: {},
      error: `Failed to get shopping list: ${err}`,
    };
  }
}
