# Cognee MCP Server Enhancement Specification

**Version:** 1.0  
**Date:** 2025-01-24  
**Status:** Ready for Implementation

---

## Executive Summary

### Current Limitations
- **Hardcoded datasets**: Tools default to `main_dataset` and `user_agent_interaction` with no flexibility
- **No categorization**: Cannot tag conversations by topic or domain
- **No temporal intelligence**: Cannot leverage Cognee's built-in temporal knowledge graph feature
- **Limited coding rules control**: Feature always enabled, not suitable for non-coding contexts

### Solution
Add parameters to existing MCP tools enabling:
1. Custom dataset organization per domain (coaching, development, research)
2. Multi-tag categorization within datasets (node_set)
3. Intelligent temporal processing with LLM-based auto-detection
4. Optional coding rules extraction for development sessions

---

## Core Improvements

### 1. Dataset Organization (`dataset_name` parameter)

**Problem**: All data goes into `main_dataset`, making it hard to separate different domains.

**Solution**: Add `dataset_name` parameter to `cognify` and `save_interaction` tools.

**Benefits**:
- Separate databases per domain (coaching, development, research)
- Independent querying and management
- Clean deletion by domain
- Better search relevance

**Example**:
```python
save_interaction(
    data="Coaching session transcript...",
    dataset_name="coaching"  # Separate from development data
)
```

### 2. Multi-Tag Categorization (`node_set` parameter)

**Concept**: Dataset = container, node_set = tags/labels

**Problem**: Cannot categorize content within a dataset.

**Solution**: Add `node_set` parameter accepting list of tags.

**Benefits**:
- Filter by topic: `["medication_tracking"]`, `["adhd_coaching"]`
- Cross-reference: `["frontend", "react", "troubleshooting"]`
- Time-based tags: `["2025_q1"]` for period filtering
- Multiple tags per conversation

**Example**:
```python
save_interaction(
    data="Discussion about medication adjustment...",
    dataset_name="coaching",
    node_set=["medication_tracking", "adhd_coaching", "2025_q1"]
)
```

### 3. Intelligent Temporal Processing

**Discovery**: Cognee has built-in temporal knowledge graph feature (`temporal_cognify=True`) not exposed in MCP.

**Current Behavior**: No temporal processing, missing timeline/evolution tracking.

**Solution**: Add `temporal_cognify` parameter with LLM-based auto-detection.

**How It Works**:
1. Default: `temporal_cognify="auto"` 
2. LLM analyzes conversation for temporal relevance
3. Auto-enables if: dates mentioned, sequences, significant events
4. Can override with explicit `"true"` or `"false"`

**Temporal Processing Adds**:
- Date entity extraction (any language)
- Time-ordered events
- Before/after relationships
- Timeline queries: "What happened between Jan 15-25?"

**Example**:
```python
# Auto-detects temporal need
save_interaction(
    data="Started Ritalin Jan 15. Noticed crash Jan 20. Adjusted Jan 22.",
    dataset_name="coaching",
    temporal_cognify="auto"  # LLM detects dates → enables temporal
)
```

**When Temporal Is Used**:
- ✅ Specific dates mentioned
- ✅ Event sequences (before/after)
- ✅ Significant moments ("today my cat died")
- ✅ Timeline/progression important

**When Temporal Is Skipped**:
- ❌ Timeless concepts
- ❌ Technical explanations
- ❌ General patterns
- ❌ Reference material

### 4. Optional Coding Rules Extraction

**Current**: Always runs in direct mode, not suitable for coaching/personal conversations.

**Solution**: Add `generate_coding_rules` boolean parameter (default: `false`).

**What It Does**:
- Analyzes conversation with LLM
- Compares against previous conversations
- Extracts recurring coding patterns
- Creates distilled rules linking back to source conversations

**Use Only For**: Development troubleshooting where patterns emerge.

---

## Technical Implementation

### Modified: `cognify` Tool

**File**: `cognee-mcp/src/server.py`

```python
@mcp.tool()
async def cognify(
    data: str,
    dataset_name: str = "main_dataset",  # NEW
    temporal_cognify: bool = False,      # NEW
    graph_model_file: str = None,
    graph_model_name: str = None,
    custom_prompt: str = None
) -> list:
```

**Changes**:
- Add `dataset_name` parameter, pass to `cognee_client.add()`
- Add `temporal_cognify` parameter, pass to `cognee_client.cognify()`

### Modified: `save_interaction` Tool

**File**: `cognee-mcp/src/server.py`

```python
@mcp.tool()
async def save_interaction(
    data: str,
    dataset_name: str = "interactions",      # NEW
    node_set: list = None,                   # NEW
    temporal_cognify: str = "auto",          # NEW
    generate_coding_rules: bool = False      # NEW
) -> list:
```

**Logic Flow**:
```python
# 1. Temporal auto-detection (if "auto")
if temporal_cognify == "auto":
    decision = await should_use_temporal(data)
    use_temporal = decision.use_temporal
else:
    use_temporal = temporal_cognify == "true"

# 2. Add and cognify
await cognee_client.add(data, dataset_name=dataset_name, node_set=node_set)
await cognee_client.cognify(temporal_cognify=use_temporal)

# 3. Coding rules (if enabled and direct mode)
if generate_coding_rules and not cognee_client.use_api:
    await add_rule_associations(data, rules_nodeset_name=f"{dataset_name}_coding_rules")
```

### New Function: `should_use_temporal()`

**File**: `cognee-mcp/src/server.py`

```python
async def should_use_temporal(data: str) -> TemporalDecision:
    """
    LLM-based analysis to determine if temporal processing would be valuable.
    Language-agnostic, domain-agnostic.
    """
    
    prompt = """Analyze this content and determine if temporal knowledge graph processing would be valuable.

Temporal processing captures WHEN things happened and how they evolved over time.

USE temporal processing when content contains:
- Specific dates or time references (explicit or implicit like "today", "yesterday")
- Sequences of events ("first", "then", "after", "before")
- Changes or progression over time
- Duration or frequency information
- Time-bound observations or states
- Events where timing is significant for recall or analysis

DO NOT use temporal processing when content is:
- Timeless concepts or explanations
- Theoretical discussions
- General patterns without time anchors
- Reference material or documentation
- Abstract ideas without temporal context

Key question: Would knowing WHEN help understand or retrieve this information later?

Content:
{content}

Respond with your decision and brief reasoning."""

    response = await LLMGateway.acreate_structured_output(
        text_input=prompt.format(content=data),
        system_prompt="You are an expert at analyzing whether temporal context matters for knowledge organization.",
        response_model=TemporalDecision
    )
    
    return response

class TemporalDecision(DataPoint):
    use_temporal: bool = Field(..., description="Whether temporal processing should be enabled")
    reasoning: str = Field(..., description="Brief explanation of the decision")
```

### Modified: `cognee_client.py`

**File**: `cognee-mcp/src/cognee_client.py`

```python
async def cognify(
    self,
    datasets: Optional[List[str]] = None,
    temporal_cognify: bool = False,  # NEW parameter
    custom_prompt: Optional[str] = None,
    graph_model: Any = None,
) -> Dict[str, Any]:
    """Add temporal_cognify support"""
    
    if self.use_api:
        payload = {
            "datasets": datasets or ["main_dataset"],
            "run_in_background": False,
            "temporal_cognify": temporal_cognify  # NEW
        }
        # ... rest of API call
    else:
        kwargs = {}
        if datasets:
            kwargs["datasets"] = datasets
        if custom_prompt:
            kwargs["custom_prompt"] = custom_prompt
        if graph_model:
            kwargs["graph_model"] = graph_model
        kwargs["temporal_cognify"] = temporal_cognify  # NEW
        
        await self.cognee.cognify(**kwargs)
```

---

## Usage Examples

### Coaching Session with Auto-Temporal
```python
save_interaction(
    data="""
METADATA:
Date: 2025-01-24
Session: ADHD Coaching
Topics: medication adjustment

CONVERSATION:
Started Ritalin on January 15th at 10mg.
By January 20th, noticed energy crash at 2pm.
Adjusted to 15mg on January 22nd.
Crash resolved by January 25th.
    """,
    dataset_name="coaching",
    node_set=["medication_tracking", "adhd_coaching"],
    # temporal_cognify="auto" → LLM detects dates, enables temporal
)

# Later query:
search(
    query="What medication changes happened in January?",
    search_type="TEMPORAL"
)
```

### Development Session without Temporal
```python
save_interaction(
    data="""
Fixed React infinite render bug.
Root cause: Missing dependency array in useEffect.
Solution: Added [data, setData] to dependency array.
    """,
    dataset_name="development",
    node_set=["react", "troubleshooting", "frontend"],
    temporal_cognify="false",  # Timeless pattern
    generate_coding_rules=True  # Extract pattern for future reference
)
```

### Research Document with Temporal
```python
cognify(
    data="Summary of ADHD medication timing research paper from 2024...",
    dataset_name="research",
    temporal_cognify=True  # Track when research was conducted
)
```

---

## Future Enhancements (Secondary Priority)

### 1. Dynamic Dataset Creation
**Need**: Allow AI to create new datasets during conversation when new topics emerge.

**Proposed Tool**:
```python
@mcp.tool()
async def create_dataset(
    name: str,
    description: str = None
) -> dict:
    """Create a new dataset for organizing related content"""
```

**Use Case**: 
- User: "Let's track this project separately"
- AI: Creates `project_x` dataset
- Subsequent saves go to new dataset

### 2. Enhanced Data Inspection
**Current Problem**: 
- `list_data` shows "N/A" for creation dates
- Limited information in API mode
- Hard to understand what's stored

**Proposed Tool**:
```python
@mcp.tool()
async def inspect_data(
    dataset_name: str,
    limit: int = 10
) -> list:
    """
    Get detailed information about data items in a dataset.
    Returns: creation dates, content previews, metadata, processing status
    """
```

### 3. Schema Management
**Current Gap**: 
- `cognify` accepts `graph_model_file` but no way to list available schemas
- Can't inspect custom schema definitions

**Proposed Tools**:
```python
@mcp.tool()
async def list_schemas() -> list:
    """List all available graph schemas"""

@mcp.tool()
async def get_schema(name: str) -> dict:
    """Get details of a specific schema"""
```

### 4. Data Update/Modification
**Current Limitation**: 
- Can delete data
- Cannot update or modify existing data
- Must delete and re-add to change content

**Proposed Tool**:
```python
@mcp.tool()
async def update_data(
    data_id: str,
    new_content: str,
    re_cognify: bool = True
) -> dict:
    """
    Update existing data content.
    Optionally re-run cognify to update knowledge graph.
    """
```

**Workflow**:
1. Update data content
2. Re-cognify if needed
3. Maintains existing relationships where possible

---

## Migration & Compatibility

### Backward Compatibility
All new parameters have defaults that maintain current behavior:
- `dataset_name` defaults to `"main_dataset"` (current behavior)
- `node_set` defaults to `None` (no categorization, like now)
- `temporal_cognify` defaults to `"auto"` (intelligent, opt-in)
- `generate_coding_rules` defaults to `False` (opt-in)

### Breaking Changes
**None.** All changes are additive.

### Migration Path
1. Deploy updated MCP server
2. Existing tools continue working unchanged
3. New parameters available immediately
4. Update AI system prompts to use new features

---

## Performance & Cost Impact

### Temporal Auto-Detection
- **Time**: +1-2 seconds per save (LLM analysis)
- **Cost**: +$0.002-0.005 per save
- **Impact**: ~10% increase on already-expensive cognify operation
- **Benefit**: Optimizes expensive temporal processing (saves 20-40% when not needed)

### Overall
- Minimal performance impact
- Features are opt-in
- Smart defaults reduce cognitive load
- No impact on existing usage

---

## Implementation Priority

1. **High Priority** (Core functionality):
   - Add `dataset_name` to both tools
   - Add `node_set` to `save_interaction`
   - Add `temporal_cognify` with auto-detection
   - Add `generate_coding_rules` flag

2. **Medium Priority** (Future enhancements):
   - Dynamic dataset creation tool
   - Enhanced data inspection

3. **Low Priority** (Nice to have):
   - Schema management tools
   - Data update/modification tool

---

## Testing Checklist

- [ ] `cognify` with custom `dataset_name`
- [ ] `save_interaction` with all new parameters
- [ ] Temporal auto-detection (positive cases)
- [ ] Temporal auto-detection (negative cases)
- [ ] Coding rules generation (enabled)
- [ ] Coding rules generation (disabled)
- [ ] Multi-language date detection
- [ ] Backward compatibility (default parameters)
- [ ] API mode vs Direct mode behavior
- [ ] Node_set filtering in searches

---

## References

- Cognee temporal example: `examples/python/temporal_example.py`
- Coding rules implementation: `cognee/tasks/codingagents/coding_rule_associations.py`
- MCP server: `cognee-mcp/src/server.py`
- Cognee client: `cognee-mcp/src/cognee_client.py`
