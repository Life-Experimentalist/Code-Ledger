# CodeLedger Architecture Graph

**Graph Statistics:**
- 1203 nodes
- 2782 edges
- 81 communities

## God Nodes

High-centrality nodes that connect many different parts of the system:

1. **_update()**
2. **draw()**
3. **get()**
4. **parse()**
5. **set()**
6. **updateElements()**
7. **isArray()**
8. **getContext()**
9. **isHorizontal()**
10. **isObject()**

## Surprising Connections

Unexpected relationships between distant parts of the system:

1. {'source': 'githubAsInstallation()', 'target': 'parse()', 'source_files': ['worker\\src\\index.js', 'src\\vendor\\chart-bundle.js'], 'confidence': 'INFERRED', 'relation': 'calls', 'why': 'inferred connection - not explicitly stated in source; connects across different repos/directories; bridges separate communities; peripheral node `githubAsInstallation()` unexpectedly reaches hub `parse()`'}
2. {'source': 'extractWorkerRoutes()', 'target': 'add()', 'source_files': ['dev\\validate-openapi.js', 'src\\vendor\\chart-bundle.js'], 'confidence': 'INFERRED', 'relation': 'calls', 'why': 'inferred connection - not explicitly stated in source; connects across different repos/directories; bridges separate communities'}
3. {'source': 'compare()', 'target': 'has()', 'source_files': ['dev\\validate-openapi.js', 'src\\vendor\\chart-bundle.js'], 'confidence': 'INFERRED', 'relation': 'calls', 'why': 'inferred connection - not explicitly stated in source; connects across different repos/directories; bridges separate communities'}
4. {'source': '_boundSegment()', 'target': 'compare()', 'source_files': ['src\\vendor\\chart-bundle.js', 'dev\\validate-openapi.js'], 'confidence': 'INFERRED', 'relation': 'calls', 'why': 'inferred connection - not explicitly stated in source; connects across different repos/directories; bridges separate communities'}
5. {'source': 'fetchSubmissionDetail()', 'target': 'number()', 'source_files': ['dev\\import-profile\\leetcode-importer.js', 'src\\vendor\\chart-bundle.js'], 'confidence': 'INFERRED', 'relation': 'calls', 'why': 'inferred connection - not explicitly stated in source; connects across different repos/directories; bridges separate communities'}

## Community Structure

The graph is organized into 81 communities:

- **Community 0**: 232 members
- **Community 1**: 126 members
- **Community 2**: 108 members
- **Community 3**: 97 members
- **Community 4**: 60 members
- **Community 5**: 54 members
- **Community 6**: 54 members
- **Community 7**: 49 members
- **Community 8**: 47 members
- **Community 9**: 42 members
- **Community 10**: 41 members
- **Community 11**: 35 members
- **Community 12**: 33 members
- **Community 13**: 32 members
- **Community 14**: 27 members
- **Community 15**: 21 members
- **Community 16**: 19 members
- **Community 17**: 11 members
- **Community 18**: 5 members
- **Community 19**: 4 members
