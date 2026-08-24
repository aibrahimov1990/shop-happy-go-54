/**
 * Shared, paginated read of public.device_tokens.
 *
 * The Supabase Data API caps any single response at 1,000 rows, so an
 * unbounded `.select("token, user_id")` silently truncates the audience once
 * more than 1,000 devices are registered. This helper pages through the table
 * with `.range()` in deterministic `token` order until a page comes back
 * smaller than the batch size, and reports how many pages it read.
 */
export const DEVICE_TOKEN_PAGE_SIZE = 1000;

export type DeviceTokenRow = { token: string; user_id: string | null };

export async function fetchAllDeviceTokens(
  client: {
    from: (table: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => {
          range: (
            from: number,
            to: number,
          ) => PromiseLike<{ data: DeviceTokenRow[] | null; error: { message: string } | null }>;
        };
      };
    };
  },
  pageSize: number = DEVICE_TOKEN_PAGE_SIZE,
): Promise<{ rows: DeviceTokenRow[]; pageCount: number }> {
  const rows: DeviceTokenRow[] = [];
  let pageCount = 0;
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("device_tokens")
      .select("token, user_id")
      .order("token", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    pageCount++;
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return { rows, pageCount };
}
