import type { ToolResult } from '../../../types';
import { aiLog } from '../../logging/AILogger';
import { googleAuth } from '../../auth/GoogleAuthService';

export async function handleAddShoppingItem(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const item = args.item as string;
  const notes = args.notes as string | undefined;

  if (!item) {
    return {
      success: false,
      tool_name: 'add_shopping_item',
      data: {},
      error: 'Missing required parameter: item',
    };
  }

  if (!googleAuth.isSignedIn) {
    return {
      success: false,
      tool_name: 'add_shopping_item',
      data: {},
      error: 'Not signed in to Google. User needs to sign in first.',
    };
  }

  try {
    const { addShoppingItem } = require('../../auth/GoogleAPIClient');
    const task = await addShoppingItem(item, notes);

    aiLog('agent', `Added shopping item: "${item}"`);

    return {
      success: true,
      tool_name: 'add_shopping_item',
      data: { task_id: task.id, item: task.title, notes: task.notes },
    };
  } catch (err) {
    return {
      success: false,
      tool_name: 'add_shopping_item',
      data: {},
      error: `Failed to add shopping item: ${err}`,
    };
  }
}
