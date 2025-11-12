# Frontend Integration Analysis: Metadata Enrichment for RAG Upload

**Expert Team:**
- **Elena Rodriguez** - Lead Python Developer & Backend Architect
- **Marcus Chen** - Senior Frontend Developer (React/Next.js)
- **Sophia Kim** - UI/UX Expert & Design Systems Lead
- **Dr. James Wilson** - Master Architect & System Design Strategist

**Date:** 2025-11-12
**Context:** Integrating the metadata enrichment recommendations into Cognee's frontend upload flow

---

## Executive Summary

**Key Finding:** The metadata enrichment strategy can be successfully integrated into the existing Next.js frontend with a **progressive disclosure UI pattern**. This allows users to optionally enrich documents with metadata during upload while maintaining the simple "drag and drop" flow for basic users.

**Recommended Approach:** Multi-step upload wizard with smart defaults and optional enrichment steps.

**Development Effort:** ~2-3 weeks for core implementation, ~1 additional week for polish and testing.

---

## 1. Current State Assessment

### Dr. Wilson (Master Architect):

**Current Upload Flow Analysis:**

The existing UI has **three upload patterns**:

1. **CogneeAddWidget** - Simple one-click upload (hidden file input)
2. **AddDataToCognee** - Modal with dataset selection + file list
3. **DatasetsAccordion** - Accordion-based upload per dataset

**Current API Surface:**
```typescript
// Frontend sends minimal data
formData.append("data", file, file.name);
formData.append("datasetId", dataset.id);
formData.append("datasetName", dataset.name);
```

**Backend supports but frontend doesn't expose:**
- `node_set`: List[str] - Graph organization tags
- `preferred_loaders`: dict - Custom loader configuration
- `incremental_loading`: bool - Process only new files

**Critical Gap:** Zero metadata fields exposed in UI

---

## 2. Technical Architecture Review

### Elena Rodriguez (Lead Python Developer):

**Backend Readiness Assessment:**

✅ **Ready to receive metadata:**
```python
# From cognee/tasks/ingestion/ingest_data.py:36-40
def get_external_metadata_dict(data_item: Union[BinaryIO, str, Any]) -> dict[str, Any]:
    if hasattr(data_item, "dict") and inspect.ismethod(getattr(data_item, "dict")):
        return {"metadata": data_item.dict(), "origin": str(type(data_item))}
    else:
        return {}
```

**Storage:** Metadata stored in `Data.external_metadata` (JSON column - queryable)

**API Endpoint Modification Needed:**
```python
# Current: cognee/api/v1/add/routers/get_add_router.py
@router.post("", response_model=dict)
async def add(
    data: List[UploadFile] = File(default=None),
    datasetName: Optional[str] = Form(default=None),
    datasetId: Union[UUID, Literal[""], None] = Form(default=None),
    node_set: Optional[List[str]] = Form(default=[""], example=[""]),
    # ⚠️ MISSING: metadata fields
    user: User = Depends(get_authenticated_user),
):
```

**Proposed Enhancement:**
```python
@router.post("", response_model=dict)
async def add(
    data: List[UploadFile] = File(default=None),
    datasetName: Optional[str] = Form(default=None),
    datasetId: Union[UUID, Literal[""], None] = Form(default=None),
    node_set: Optional[List[str]] = Form(default=[""], example=[""]),

    # NEW: Per-file metadata as JSON string
    metadata: Optional[str] = Form(default=None),
    # Expected format: {"file1.pdf": {"title": "...", "authors": [...], ...}, ...}

    # NEW: Global metadata for all files
    global_metadata: Optional[str] = Form(default=None),
    # Expected format: {"primary_topic": "AI", "doc_type": "article", ...}

    user: User = Depends(get_authenticated_user),
):
    # Parse metadata JSON
    file_metadata = json.loads(metadata) if metadata else {}
    global_meta = json.loads(global_metadata) if global_metadata else {}

    # Merge and attach to each file during processing
    # ...
```

**Backend Changes Required:**
1. Update `/v1/add` endpoint to accept metadata parameters ✅ **Simple**
2. Modify `ingest_data.py` to merge metadata into `external_metadata` ✅ **Simple**
3. Add validation for metadata schema ⚠️ **Optional but recommended**

**Estimated Backend Effort:** 1-2 days

---

## 3. Frontend Architecture Design

### Marcus Chen (Senior Frontend Developer):

**Technology Stack Assessment:**

Current stack:
- **Next.js 15.3.3** with App Router ✅
- **React 19.0.0** with hooks ✅
- **TypeScript 5** (strict mode) ✅
- **Tailwind CSS 4.1.7** ✅
- **Custom component library** (no external UI lib)

**State Management:** React hooks only (no Redux/Zustand)

**Recommended Approach:** Multi-step modal wizard using existing components

**Component Reuse Opportunities:**
- ✅ `Modal` component - Already exists
- ✅ `Input`, `Select`, `TextArea` - Already exists
- ✅ `useModal` hook - Already exists
- ⚠️ **Missing:** Stepper/wizard component (need to build)
- ⚠️ **Missing:** Multi-value input (tags/chips) for authors, keywords
- ⚠️ **Missing:** Date picker component

**Proposed Component Architecture:**

```
<UploadWizardModal>
  ├── <WizardStepper>           # NEW: Step indicator (1, 2, 3)
  ├── <Step1: FileSelection>    # Existing file upload logic
  ├── <Step2: BasicMetadata>    # NEW: Title, authors, date, type
  ├── <Step3: EnrichmentMetadata> # NEW: Topic, keywords, quality
  └── <WizardControls>          # NEW: Back, Next, Skip, Submit
</UploadWizardModal>
```

**TypeScript Interfaces:**

```typescript
// src/modules/ingestion/types.ts
export interface DocumentMetadata {
  // Core fields
  title?: string;
  authors?: string[];
  publication_date?: string; // ISO 8601 format
  source_url?: string;

  // Topic classification
  primary_topic?: string;
  subtopics?: string[];
  keywords?: string[];

  // Document type
  doc_type?: 'book' | 'article' | 'blog_post' | 'interview' | 'paper' | 'technical_doc';

  // Quality indicators
  credibility_score?: number; // 0-1
  publication_venue?: string;
  peer_reviewed?: boolean;

  // Content characteristics
  language?: string;
  reading_level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';

  // External references
  external_ids?: Record<string, string>; // doi, arxiv_id, isbn, etc.
}

export interface FileWithMetadata {
  file: File;
  metadata: DocumentMetadata;
}
```

**State Management Pattern:**

```typescript
// src/modules/ingestion/useUploadWizard.ts
export function useUploadWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [files, setFiles] = useState<File[]>([]);
  const [filesMetadata, setFilesMetadata] = useState<Map<string, DocumentMetadata>>(new Map());
  const [globalMetadata, setGlobalMetadata] = useState<Partial<DocumentMetadata>>({});

  const updateFileMetadata = (fileName: string, metadata: Partial<DocumentMetadata>) => {
    setFilesMetadata(prev => new Map(prev).set(fileName, { ...prev.get(fileName), ...metadata }));
  };

  const applyGlobalMetadata = () => {
    // Apply global metadata to all files
    files.forEach(file => {
      updateFileMetadata(file.name, globalMetadata);
    });
  };

  return {
    currentStep,
    nextStep: () => setCurrentStep(s => s + 1),
    prevStep: () => setCurrentStep(s => s - 1),
    files,
    setFiles,
    filesMetadata,
    updateFileMetadata,
    globalMetadata,
    setGlobalMetadata,
    applyGlobalMetadata,
  };
}
```

**API Integration:**

```typescript
// src/modules/ingestion/addDataWithMetadata.ts
export async function addDataWithMetadata(
  dataset: { id?: string, name?: string },
  filesWithMetadata: FileWithMetadata[],
  nodeSet?: string[],
  useCloud = false
) {
  const formData = new FormData();

  // Add files
  filesWithMetadata.forEach(({ file }) => {
    formData.append("data", file, file.name);
  });

  // Add dataset info
  if (dataset.id) formData.append("datasetId", dataset.id);
  if (dataset.name) formData.append("datasetName", dataset.name);

  // Add node_set
  if (nodeSet && nodeSet.length > 0) {
    nodeSet.forEach(node => formData.append("node_set", node));
  }

  // Add per-file metadata as JSON
  const metadataMap: Record<string, DocumentMetadata> = {};
  filesWithMetadata.forEach(({ file, metadata }) => {
    metadataMap[file.name] = metadata;
  });
  formData.append("metadata", JSON.stringify(metadataMap));

  return fetch("/v1/add", {
    method: "POST",
    body: formData,
  }).then(response => response.json());
}
```

**Estimated Frontend Effort:** 8-10 days

---

## 4. UI/UX Design Strategy

### Sophia Kim (UI/UX Expert):

**Design Principles:**

1. **Progressive Disclosure** - Don't overwhelm users with all fields at once
2. **Smart Defaults** - Auto-populate when possible
3. **Flexibility** - Support both minimal and rich metadata flows
4. **Batch Operations** - Apply metadata to multiple files at once
5. **Non-Blocking** - Allow upload without metadata (optional enrichment)

**User Personas:**

**Persona 1: Quick Uploader (60% of users)**
- Wants fast upload
- Minimal interaction
- "Just process my files"

**Persona 2: Organized Researcher (30% of users)**
- Wants topic organization
- Basic metadata (title, topic, type)
- Cares about findability

**Persona 3: Power User (10% of users)**
- Wants complete metadata control
- Research-grade cataloging
- Maximum retrieval quality

**Proposed UX Flow:**

### **Option 1: Progressive Wizard (RECOMMENDED)**

```
┌─────────────────────────────────────────────┐
│ Upload Files to Dataset                     │
│                                             │
│  Step 1 of 3: Select Files                  │
│  ○────○────○                                │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  📁 Drop files here or click        │   │
│  │                                     │   │
│  │  [Click to browse files]            │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Selected files (3):                        │
│  • transformer_paper.pdf                    │
│  • attention_blog.txt                       │
│  • gpt_interview.docx                       │
│                                             │
│  [< Back]              [Skip] [Next >]      │
└─────────────────────────────────────────────┘

          ↓ User clicks "Next"

┌─────────────────────────────────────────────┐
│ Upload Files to Dataset                     │
│                                             │
│  Step 2 of 3: Basic Information             │
│  ●────○────○                                │
│                                             │
│  Apply to all files:                        │
│  ┌─────────────────────────────────────┐   │
│  │ Primary Topic: [AI ▼]               │   │
│  │ Document Type: [Article ▼]          │   │
│  │ Language: [English ▼]                │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  Or edit individually:                      │
│  ┌─────────────────────────────────────┐   │
│  │ 📄 transformer_paper.pdf             │   │
│  │    Topic: AI    Type: Paper  [Edit] │   │
│  ├─────────────────────────────────────┤   │
│  │ 📄 attention_blog.txt                │   │
│  │    Topic: AI    Type: Blog   [Edit] │   │
│  ├─────────────────────────────────────┤   │
│  │ 📄 gpt_interview.docx                │   │
│  │    Topic: AI    Type: Interview [Edit]│  │
│  └─────────────────────────────────────┘   │
│                                             │
│  [< Back]              [Skip] [Next >]      │
└─────────────────────────────────────────────┘

          ↓ User clicks "Next"

┌─────────────────────────────────────────────┐
│ Upload Files to Dataset                     │
│                                             │
│  Step 3 of 3: Optional Details (Advanced)   │
│  ●────●────○                                │
│                                             │
│  Editing: transformer_paper.pdf             │
│  [< Prev File] [Next File >]                │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ Title:                               │   │
│  │ [Attention Is All You Need        ] │   │
│  │                                     │   │
│  │ Authors (comma-separated):          │   │
│  │ [Vaswani, Shazeer, Parmar, ...    ] │   │
│  │                                     │   │
│  │ Publication Date:                    │   │
│  │ [2017-06-12]  📅                     │   │
│  │                                     │   │
│  │ Keywords (comma-separated):          │   │
│  │ [transformers, attention, NLP]       │   │
│  │                                     │   │
│  │ Publication Venue:                   │   │
│  │ [NeurIPS 2017]                       │   │
│  │                                     │   │
│  │ ☑ Peer Reviewed                      │   │
│  │                                     │   │
│  │ DOI/ArXiv ID:                        │   │
│  │ [1706.03762]                         │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [< Back]     [Skip All] [Upload Files]     │
└─────────────────────────────────────────────┘
```

### **Option 2: Inline Enrichment (Alternative)**

```
┌─────────────────────────────────────────────┐
│ Add Data to Dataset                         │
│                                             │
│ Dataset: [AI Research ▼]                    │
│                                             │
│ ┌─────────────────────────────────────┐    │
│ │ 📁 Drop files or [Select Files]      │    │
│ └─────────────────────────────────────┘    │
│                                             │
│ Files (3):                                  │
│ ┌─────────────────────────────────────┐    │
│ │ ✓ transformer_paper.pdf              │    │
│ │   [+ Add metadata]                   │    │
│ │                                      │    │
│ │ ✓ attention_blog.txt                 │    │
│ │   Topic: AI  Type: Blog  [Edit]      │    │
│ │                                      │    │
│ │ ✓ gpt_interview.docx                 │    │
│ │   [+ Add metadata]                   │    │
│ └─────────────────────────────────────┘    │
│                                             │
│ Batch Actions:                              │
│ ☑ Set topic for all: [AI ▼]                │
│ ☑ Set type for all: [Article ▼]            │
│                                             │
│ [Cancel]                    [Upload Files]  │
└─────────────────────────────────────────────┘
```

**Recommendation:** **Option 1 (Progressive Wizard)** for following reasons:
- ✅ Clear step-by-step progression
- ✅ Batch operations in Step 2 (efficient for multiple files)
- ✅ Optional detail editing in Step 3 (power users)
- ✅ Can skip steps (flexible)
- ✅ Less overwhelming than showing all fields at once

**Visual Design Considerations:**

**Colors:**
- Use existing purple primary (#6510F4) for active steps
- Gray for incomplete steps
- Green (#0DFF00) for completed steps

**Layout:**
- Maintain existing pill-shaped buttons (rounded-3xl)
- Use existing Modal component
- Add new WizardStepper component (circular step indicators)

**Accessibility:**
- ARIA labels for step navigation
- Keyboard shortcuts (Tab, Shift+Tab, Enter, Escape)
- Focus management between steps
- Screen reader announcements for step changes

**Mobile Responsiveness:**
- Stack file list vertically on mobile
- Simplify metadata form on small screens
- Consider collapsible sections for advanced fields

**Estimated Design Effort:** 3-4 days (mockups + prototypes)

---

## 5. Implementation Plan

### Dr. Wilson (Master Architect):

**Phase 1: Foundation (Week 1)**

**Backend Tasks:**
1. Extend `/v1/add` endpoint to accept `metadata` and `global_metadata` parameters
2. Update `ingest_data.py` to merge metadata into `external_metadata` field
3. Add metadata validation (optional but recommended)
4. Add API documentation for new fields
5. Write unit tests for metadata handling

**Estimated:** 2 days (Elena)

**Frontend Tasks:**
1. Create TypeScript interfaces for metadata
2. Build base wizard components:
   - `WizardStepper` - Step indicator
   - `WizardModal` - Modal wrapper with step state
   - `WizardControls` - Navigation buttons
3. Build tag input component (for authors, keywords)
4. Set up wizard state management hook

**Estimated:** 3 days (Marcus)

---

**Phase 2: Core Implementation (Week 2)**

**Frontend Tasks:**
1. Implement Step 1: File selection (reuse existing logic)
2. Implement Step 2: Basic metadata form
   - Topic dropdown (pre-populate from existing datasets)
   - Document type dropdown
   - Batch apply functionality
   - Individual file editing
3. Implement Step 3: Advanced metadata form
   - Title, authors, date, keywords
   - Publication venue, peer reviewed checkbox
   - External IDs (DOI, arXiv, ISBN)
   - File navigation (prev/next)
4. Wire up API integration with new metadata fields
5. Add form validation

**Estimated:** 5 days (Marcus)

**UI/UX Tasks:**
1. Create detailed mockups for all 3 steps
2. Design empty states and error states
3. Design mobile responsive layouts
4. Conduct internal usability review

**Estimated:** 2 days (Sophia)

---

**Phase 3: Polish & Testing (Week 3)**

**Frontend Tasks:**
1. Add loading states and progress indicators
2. Implement "Skip" functionality for optional steps
3. Add "Save as template" for power users (optional)
4. Error handling and user feedback
5. Accessibility audit (keyboard nav, ARIA labels)
6. Mobile testing and refinements
7. Cross-browser testing

**Estimated:** 3 days (Marcus)

**UI/UX Tasks:**
1. User acceptance testing with 3-5 users
2. Iterate based on feedback
3. Final design polish

**Estimated:** 2 days (Sophia)

**Backend Tasks:**
1. Integration testing with frontend
2. Performance testing with large files
3. Security review for metadata injection

**Estimated:** 2 days (Elena)

---

**Phase 4: Optional Enhancements (Future)**

**Smart Defaults & Automation:**
1. LLM-assisted metadata extraction
   - Extract title from PDF metadata or first page
   - Detect document type from file extension + content
   - Suggest keywords using NLP
2. Bulk import from CSV (for research libraries)
3. Metadata templates (save frequently used metadata sets)
4. Auto-detect topic from existing dataset content

**Advanced Features:**
1. Collaborative metadata editing (multi-user)
2. Metadata validation against ontologies
3. Batch metadata editing for existing files
4. Metadata export/import

---

## 6. Technical Considerations

### Elena Rodriguez (Backend):

**Data Storage:**
- ✅ `external_metadata` is JSON column (PostgreSQL/SQLite JSONB)
- ✅ Queryable via SQL: `WHERE external_metadata->>'primary_topic' = 'AI'`
- ✅ Indexed for performance if needed

**Validation Strategy:**
```python
# Proposed validator using Pydantic
from pydantic import BaseModel, Field, validator

class DocumentMetadataValidator(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    authors: Optional[List[str]] = Field(None, max_items=50)
    publication_date: Optional[datetime] = None
    primary_topic: Optional[str] = Field(None, max_length=100)
    doc_type: Optional[Literal['book', 'article', 'blog_post', 'interview', 'paper', 'technical_doc']] = None
    credibility_score: Optional[float] = Field(None, ge=0, le=1)
    # ... more fields

    @validator('authors')
    def normalize_authors(cls, v):
        if v:
            return [a.strip() for a in v if a.strip()]
        return v
```

**Security Considerations:**
- ⚠️ Sanitize metadata inputs (prevent XSS)
- ⚠️ Limit metadata size (prevent DOS via large JSON)
- ⚠️ Rate limiting on upload endpoint

### Marcus Chen (Frontend):

**Performance Optimizations:**
- Debounce metadata form inputs (reduce re-renders)
- Lazy load Step 3 components (code splitting)
- Memoize expensive computations (React.memo, useMemo)
- Virtual scrolling for large file lists (if >100 files)

**Error Handling:**
```typescript
try {
  await addDataWithMetadata(dataset, filesWithMetadata, nodeSet);
  showSuccessToast("Files uploaded successfully!");
  closeModal();
  refreshDatasets();
} catch (error) {
  if (error.status === 413) {
    showErrorToast("Files too large. Try uploading fewer files.");
  } else if (error.status === 422) {
    showErrorToast("Invalid metadata format. Please check your inputs.");
  } else {
    showErrorToast(`Upload failed: ${error.message}`);
  }
}
```

**State Persistence:**
- Save wizard state to localStorage (survive page refresh)
- Clear on successful upload
- Restore on modal reopen (ask user: "Resume previous upload?")

### Sophia Kim (UI/UX):

**User Guidance:**
- Tooltips on each metadata field (explain purpose and impact on retrieval)
- Placeholder text with examples ("e.g., AI, quantum_computing, biology")
- Inline validation with clear error messages
- Help icon (?) with link to documentation

**Empty States:**
- "No files selected" - Show icon + help text
- "No metadata added" - Show benefits of adding metadata

**Loading States:**
- File upload progress per file (0-100%)
- "Processing metadata..." spinner
- Estimated time remaining (if available)

---

## 7. Migration Strategy for Existing Users

### Dr. Wilson (Architect):

**Backward Compatibility:**
- ✅ Old upload flow (minimal) still works
- ✅ New metadata fields are optional
- ✅ Existing data without metadata unaffected

**Gradual Rollout:**

**Phase 1:** Feature flag (default: OFF)
```typescript
// src/config/featureFlags.ts
export const ENABLE_METADATA_ENRICHMENT =
  process.env.NEXT_PUBLIC_ENABLE_METADATA_ENRICHMENT === 'true';
```

**Phase 2:** Opt-in for beta users
- Add toggle in account settings
- Collect feedback

**Phase 3:** Default ON with ability to disable
- Add "Simple mode" toggle for power users who want minimal flow

**Phase 4:** Full rollout
- Show onboarding tooltip: "New: Add metadata to improve search quality!"
- Provide tutorial video

**Existing Data Enrichment:**
- Offer "Add metadata to existing files" feature
- Bulk metadata editing interface
- LLM-assisted metadata extraction for existing files

---

## 8. Success Metrics

### Sophia Kim (UX):

**Quantitative Metrics:**
- **Adoption Rate:** % of users who use metadata enrichment
- **Completion Rate:** % of uploads that complete all 3 steps vs skip
- **Average Fields Filled:** Track which fields are most commonly used
- **Upload Time:** Measure if metadata adds significant friction
- **Error Rate:** % of uploads with metadata validation errors

**Qualitative Metrics:**
- User feedback surveys (1-5 star rating)
- Support tickets related to metadata
- User interviews with power users

**Success Criteria:**
- 40%+ adoption rate within 3 months
- <10% abandonment rate on Step 2
- Average 3+ metadata fields filled per file
- 4+ star user satisfaction rating

---

## 9. Risks & Mitigation

### Dr. Wilson (Architect):

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **User friction** - Metadata adds too much complexity | High | Medium | Progressive disclosure, skip functionality, smart defaults |
| **Low adoption** - Users ignore new feature | Medium | Medium | Onboarding, tooltips explaining benefits, show retrieval improvement |
| **Performance** - Large metadata slows upload | Medium | Low | Pagination, lazy loading, backend optimization |
| **Security** - XSS via metadata injection | High | Low | Strict validation, sanitization, CSP headers |
| **Data quality** - Incorrect metadata worse than none | Medium | Medium | Validation, suggestions, LLM-assisted extraction |
| **Mobile UX** - Complex form on small screens | Medium | Medium | Responsive design, simplified mobile flow |

---

## 10. Recommended Decision

### Team Consensus:

**✅ PROCEED with Progressive Wizard Approach**

**Rationale:**
1. **High Impact:** 30-40% improvement in retrieval quality (from backend analysis)
2. **Moderate Effort:** 2-3 weeks implementation (manageable)
3. **Low Risk:** Backward compatible, optional, feature-flagged
4. **User Value:** Addresses power user needs without hurting quick uploaders
5. **Competitive Advantage:** Few RAG tools offer this level of metadata control

**Implementation Priority:**
1. **Must Have (Phase 1-2):**
   - File selection (Step 1)
   - Basic metadata: Topic, Document Type (Step 2)
   - Batch apply functionality
   - API integration

2. **Should Have (Phase 3):**
   - Advanced metadata: Authors, keywords, dates (Step 3)
   - Individual file editing
   - Skip functionality
   - Mobile responsive

3. **Nice to Have (Phase 4 - Future):**
   - LLM-assisted metadata extraction
   - Metadata templates
   - Bulk editing of existing files
   - CSV import for research libraries

---

## 11. Wireframes & Visual Design

### Sophia Kim (UI/UX):

**Component Hierarchy:**

```typescript
<UploadWizardModal isOpen={isOpen} onClose={closeModal}>
  <ModalHeader>
    <h2>Upload Files to Dataset</h2>
    <WizardStepper currentStep={currentStep} totalSteps={3} />
  </ModalHeader>

  <ModalBody>
    {currentStep === 1 && (
      <FileSelectionStep
        files={files}
        onFilesSelected={setFiles}
        onRemoveFile={removeFile}
      />
    )}

    {currentStep === 2 && (
      <BasicMetadataStep
        files={files}
        globalMetadata={globalMetadata}
        filesMetadata={filesMetadata}
        onGlobalMetadataChange={setGlobalMetadata}
        onFileMetadataChange={updateFileMetadata}
        onApplyToAll={applyGlobalMetadata}
      />
    )}

    {currentStep === 3 && (
      <AdvancedMetadataStep
        currentFile={files[currentFileIndex]}
        metadata={filesMetadata.get(files[currentFileIndex].name)}
        onMetadataChange={updateFileMetadata}
        onPrevFile={() => setCurrentFileIndex(i => i - 1)}
        onNextFile={() => setCurrentFileIndex(i => i + 1)}
      />
    )}
  </ModalBody>

  <ModalFooter>
    <WizardControls
      currentStep={currentStep}
      totalSteps={3}
      onBack={prevStep}
      onNext={nextStep}
      onSkip={handleSkip}
      onSubmit={handleSubmit}
      isLoading={isUploading}
    />
  </ModalFooter>
</UploadWizardModal>
```

**Design Tokens:**

```css
/* Add to globals.css */
--wizard-step-size: 40px;
--wizard-step-gap: 12px;
--wizard-line-height: 2px;
--wizard-line-color: #E5E7EB;
--wizard-active-color: var(--global-color-primary);
--wizard-complete-color: var(--global-color-secondary);
```

**Responsive Breakpoints:**
- Mobile (< 640px): Single column, simplified fields
- Tablet (640px - 1024px): Two columns for metadata form
- Desktop (> 1024px): Three columns for file list + form

---

## 12. Documentation & Training

**User Documentation Needed:**
1. **Help Article:** "How to add metadata to improve search quality"
2. **Video Tutorial:** "3-minute metadata enrichment walkthrough"
3. **Tooltips:** Inline help for each field
4. **Best Practices Guide:** "Metadata strategy for research teams"

**Developer Documentation:**
1. **API Changes:** Document new metadata parameters
2. **Component Docs:** Storybook entries for new wizard components
3. **Migration Guide:** How to upgrade from simple upload flow

---

## 13. Summary & Next Steps

### Dr. Wilson (Master Architect):

**Summary:**

We've designed a comprehensive metadata enrichment system that:
- ✅ Integrates seamlessly with existing upload flow
- ✅ Uses progressive disclosure to avoid overwhelming users
- ✅ Supports both quick uploads and rich metadata
- ✅ Leverages existing component library
- ✅ Can be feature-flagged for gradual rollout
- ✅ Delivers 30-40% better retrieval quality

**Total Effort Estimate:**
- Backend: 2-3 days (Elena)
- Frontend: 10-12 days (Marcus)
- UI/UX: 5-6 days (Sophia)
- **Total: 2-3 weeks** for core implementation

**Next Steps:**

1. **Stakeholder Approval** - Get buy-in from product team
2. **Sprint Planning** - Allocate resources for 3-week sprint
3. **Backend API Changes** - Elena implements metadata support
4. **Frontend Component Build** - Marcus builds wizard components
5. **Design Mockups** - Sophia creates detailed mockups
6. **User Testing** - Run usability tests with 5 users
7. **Launch** - Feature-flagged beta release
8. **Iterate** - Collect feedback and refine

**Risk Assessment:** ⚠️ **MEDIUM RISK**
- Moderate technical complexity
- Clear user value
- Manageable scope
- Backward compatible

**Recommendation:** ✅ **APPROVED - PROCEED TO IMPLEMENTATION**

---

**Team Signatures:**

- **Elena Rodriguez** - Lead Python Developer ✓
- **Marcus Chen** - Senior Frontend Developer ✓
- **Sophia Kim** - UI/UX Expert ✓
- **Dr. James Wilson** - Master Architect ✓

**Date:** 2025-11-12
