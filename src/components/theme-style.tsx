import { getSchool } from "@/server/school";
import { themeCss } from "@/lib/theme";

/** Sets the school's theme colour (brand shades) for the page. Nothing is output when the default blue is used. */
export async function ThemeStyle() {
  const school = await getSchool();
  if (!school.themeColor) return null;
  return <style dangerouslySetInnerHTML={{ __html: themeCss(school.themeColor) }} />;
}
