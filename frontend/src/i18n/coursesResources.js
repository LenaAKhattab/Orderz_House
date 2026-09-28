import arCourses from "../locales/ar/courses.json";
import enCourses from "../locales/en/courses.json";
import { mergeLocaleNamespaces } from "./resources";

mergeLocaleNamespaces({
  ar: { courses: arCourses },
  en: { courses: enCourses },
});
