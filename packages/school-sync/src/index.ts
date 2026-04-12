export {
  // Types
  type OralHomeworkResult,
  type WrittenHomeworkResult,
  type HomeworkSummary,
  type SchoolRequirement,
  type RequirementMatch,
  // Functions
  generateSummary,
  formatSummaryText,
  generateShareableLink,
  generateShareableImageUrl,
  syncSchoolRequirements,
  getSchoolRequirements,
  matchHomeworkToRequirements,
  clearStore,
} from './homework-summary';
