use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use skriuw_domain::{
    NodePlacement, WorkspaceOperation, WorkspaceOperationEnvelope, WorkspaceSettings,
};

pub const FIXTURE_BASE_TIMESTAMP_MS: i64 = 1_753_000_000_000;
pub const FIXTURE_TIMESTAMP_STEP_MS: i64 = 1_000;
pub const FIXTURE_SETTINGS_EXTENSION_KEY: &str = "fixtureName";
pub const SHARED_TOKEN_ALL_NOTES: &str = "sharedall";
pub const SHARED_TOKEN_EVERY_TENTH_NOTE: &str = "sharedtenth";
pub const SHARED_TOKEN_EVERY_HUNDREDTH_NOTE: &str = "sharedhundredth";

const NESTED_CHAIN_DEPTH: usize = 32;
const MIXED_WIDE_FOLDER_COUNT: usize = 8;
const MIXED_CHAIN_DEPTH: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TreeShape {
    Wide,
    Nested,
    Mixed,
}

impl TreeShape {
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Wide => "wide",
            Self::Nested => "nested",
            Self::Mixed => "mixed",
        }
    }

    #[must_use]
    const fn title_label(self) -> &'static str {
        match self {
            Self::Wide => "Wide",
            Self::Nested => "Nested",
            Self::Mixed => "Mixed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FixtureSpec {
    pub shape: TreeShape,
    pub note_count: usize,
}

#[must_use]
pub fn canonical_specs() -> [FixtureSpec; 6] {
    [
        FixtureSpec {
            shape: TreeShape::Wide,
            note_count: 1_000,
        },
        FixtureSpec {
            shape: TreeShape::Nested,
            note_count: 1_000,
        },
        FixtureSpec {
            shape: TreeShape::Mixed,
            note_count: 1_000,
        },
        FixtureSpec {
            shape: TreeShape::Wide,
            note_count: 5_000,
        },
        FixtureSpec {
            shape: TreeShape::Nested,
            note_count: 5_000,
        },
        FixtureSpec {
            shape: TreeShape::Mixed,
            note_count: 5_000,
        },
    ]
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchExpectation {
    pub term: String,
    pub expected_note_matches: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureMetadata {
    pub name: String,
    pub shape: TreeShape,
    pub note_count: usize,
    pub folder_count: usize,
    pub node_count: usize,
    pub document_count: usize,
    pub max_depth: usize,
    pub operation_count: usize,
    pub search_expectations: Vec<SearchExpectation>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WorkspaceFixture {
    pub metadata: FixtureMetadata,
    pub operations: Vec<WorkspaceOperationEnvelope>,
}

impl WorkspaceFixture {
    #[must_use]
    pub fn operation_batches(&self, batch_size: usize) -> Vec<Vec<WorkspaceOperationEnvelope>> {
        self.operations
            .chunks(batch_size.max(1))
            .map(<[WorkspaceOperationEnvelope]>::to_vec)
            .collect()
    }
}

#[must_use]
pub fn fixture_name(spec: FixtureSpec) -> String {
    format!("{}-{}", spec.shape.label(), spec.note_count)
}

#[must_use]
pub fn folder_id(spec: FixtureSpec, index: usize) -> String {
    format!("fixture-{}-folder-{index:02}", spec.shape.label())
}

#[must_use]
pub fn note_id(spec: FixtureSpec, index: usize) -> String {
    format!("fixture-{}-note-{index:05}", spec.shape.label())
}

#[must_use]
pub fn unique_note_token(spec: FixtureSpec, index: usize) -> String {
    format!("uniq{}{index:05}", spec.shape.label())
}

#[must_use]
pub fn fixture_digest(fixture: &WorkspaceFixture) -> String {
    let serialized =
        serde_json::to_vec(&fixture.operations).expect("fixture operations serialize to JSON");
    let digest = Sha256::digest(&serialized);
    let mut rendered = String::with_capacity(digest.len() * 2);
    for byte in digest {
        rendered.push_str(&format!("{byte:02x}"));
    }
    rendered
}

struct FolderBlueprint {
    id: String,
    title: String,
    parent_id: Option<String>,
    depth: usize,
}

struct Layout {
    folders: Vec<FolderBlueprint>,
    note_parents: Vec<Option<usize>>,
}

fn spread_notes(note_count: usize, folder_indices: &[usize]) -> Vec<Option<usize>> {
    let per_folder = note_count / folder_indices.len();
    let mut parents = Vec::with_capacity(note_count);
    for note in 0..note_count {
        let slot = note
            .checked_div(per_folder)
            .unwrap_or(usize::MAX)
            .min(folder_indices.len() - 1);
        parents.push(Some(folder_indices[slot]));
    }
    parents
}

fn folder_chain(
    spec: FixtureSpec,
    first_index: usize,
    depth: usize,
    title_prefix: &str,
    root_parent: Option<String>,
) -> Vec<FolderBlueprint> {
    let mut folders = Vec::with_capacity(depth);
    for level in 0..depth {
        let index = first_index + level;
        let parent_id = if level == 0 {
            root_parent.clone()
        } else {
            Some(folder_id(spec, index - 1))
        };
        folders.push(FolderBlueprint {
            id: folder_id(spec, index),
            title: format!("{title_prefix} {:02}", level + 1),
            parent_id,
            depth: level + 1,
        });
    }
    folders
}

fn wide_layout(spec: FixtureSpec) -> Layout {
    Layout {
        folders: Vec::new(),
        note_parents: vec![None; spec.note_count],
    }
}

fn nested_layout(spec: FixtureSpec) -> Layout {
    let title_prefix = format!("{} folder", spec.shape.title_label());
    let folders = folder_chain(spec, 1, NESTED_CHAIN_DEPTH, &title_prefix, None);
    let folder_indices = (0..folders.len()).collect::<Vec<_>>();
    let note_parents = spread_notes(spec.note_count, &folder_indices);
    Layout {
        folders,
        note_parents,
    }
}

fn mixed_layout(spec: FixtureSpec) -> Layout {
    let root_notes = spec.note_count / 5;
    let wide_notes = spec.note_count * 3 / 5;
    let nested_notes = spec.note_count - root_notes - wide_notes;

    let mut folders = Vec::with_capacity(MIXED_WIDE_FOLDER_COUNT + MIXED_CHAIN_DEPTH);
    let wide_title = format!("{} wide folder", spec.shape.title_label());
    for index in 0..MIXED_WIDE_FOLDER_COUNT {
        folders.push(FolderBlueprint {
            id: folder_id(spec, index + 1),
            title: format!("{wide_title} {:02}", index + 1),
            parent_id: None,
            depth: 1,
        });
    }
    let chain_title = format!("{} chain folder", spec.shape.title_label());
    folders.extend(folder_chain(
        spec,
        MIXED_WIDE_FOLDER_COUNT + 1,
        MIXED_CHAIN_DEPTH,
        &chain_title,
        None,
    ));

    let wide_indices = (0..MIXED_WIDE_FOLDER_COUNT).collect::<Vec<_>>();
    let chain_indices =
        (MIXED_WIDE_FOLDER_COUNT..MIXED_WIDE_FOLDER_COUNT + MIXED_CHAIN_DEPTH).collect::<Vec<_>>();

    let mut note_parents = vec![None; root_notes];
    note_parents.extend(spread_notes(wide_notes, &wide_indices));
    note_parents.extend(spread_notes(nested_notes, &chain_indices));
    Layout {
        folders,
        note_parents,
    }
}

fn layout(spec: FixtureSpec) -> Layout {
    match spec.shape {
        TreeShape::Wide => wide_layout(spec),
        TreeShape::Nested => nested_layout(spec),
        TreeShape::Mixed => mixed_layout(spec),
    }
}

fn note_markdown(spec: FixtureSpec, index: usize, title: &str) -> String {
    format!(
        "# {title}\n\nDeterministic fixture body {index:05} for the {} workspace shape.\n\nTokens: {}\n",
        spec.shape.label(),
        note_tokens(spec, index)
    )
}

fn note_tokens(spec: FixtureSpec, index: usize) -> String {
    let mut tokens = format!(
        "{} {SHARED_TOKEN_ALL_NOTES}",
        unique_note_token(spec, index)
    );
    if index.is_multiple_of(10) {
        tokens.push(' ');
        tokens.push_str(SHARED_TOKEN_EVERY_TENTH_NOTE);
    }
    if index.is_multiple_of(100) {
        tokens.push(' ');
        tokens.push_str(SHARED_TOKEN_EVERY_HUNDREDTH_NOTE);
    }
    tokens
}

fn note_document_json(spec: FixtureSpec, index: usize, title: &str) -> Value {
    json!({
        "type": "doc",
        "content": [
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": title}]
            },
            {
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": format!(
                        "Deterministic fixture body {index:05} for the {} workspace shape.",
                        spec.shape.label()
                    )
                }]
            },
            {
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": format!("Tokens: {}", note_tokens(spec, index))
                }]
            }
        ]
    })
}

fn fixture_settings(name: &str) -> WorkspaceSettings {
    WorkspaceSettings {
        extensions: BTreeMap::from([(
            FIXTURE_SETTINGS_EXTENSION_KEY.to_string(),
            Value::String(name.to_string()),
        )]),
        ..WorkspaceSettings::default()
    }
}

fn search_expectations(spec: FixtureSpec) -> Vec<SearchExpectation> {
    vec![
        SearchExpectation {
            term: SHARED_TOKEN_ALL_NOTES.to_string(),
            expected_note_matches: spec.note_count,
        },
        SearchExpectation {
            term: SHARED_TOKEN_EVERY_TENTH_NOTE.to_string(),
            expected_note_matches: spec.note_count / 10,
        },
        SearchExpectation {
            term: SHARED_TOKEN_EVERY_HUNDREDTH_NOTE.to_string(),
            expected_note_matches: spec.note_count / 100,
        },
        SearchExpectation {
            term: unique_note_token(spec, 1),
            expected_note_matches: usize::from(spec.note_count >= 1),
        },
    ]
}

#[must_use]
pub fn generate_workspace_fixture(spec: FixtureSpec) -> WorkspaceFixture {
    let name = fixture_name(spec);
    let layout = layout(spec);
    let mut operations = Vec::with_capacity(layout.folders.len() + layout.note_parents.len() + 2);
    let mut max_depth = 0usize;

    for folder in &layout.folders {
        max_depth = max_depth.max(folder.depth);
        operations.push(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::CreateFolder {
                id: folder.id.clone(),
                title: folder.title.clone(),
                placement: NodePlacement::last(folder.parent_id.clone()),
                at: FIXTURE_BASE_TIMESTAMP_MS + operations.len() as i64 * FIXTURE_TIMESTAMP_STEP_MS,
            },
        ));
    }

    for (position, folder_slot) in layout.note_parents.iter().enumerate() {
        let index = position + 1;
        let parent = folder_slot.map(|slot| &layout.folders[slot]);
        let depth = parent.map_or(0, |folder| folder.depth) + 1;
        max_depth = max_depth.max(depth);
        let title = format!("{} note {index:05}", spec.shape.title_label());
        operations.push(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::CreateNote {
                id: note_id(spec, index),
                title: title.clone(),
                placement: NodePlacement::last(parent.map(|folder| folder.id.clone())),
                document_json: note_document_json(spec, index, &title),
                markdown: note_markdown(spec, index, &title),
                at: FIXTURE_BASE_TIMESTAMP_MS + operations.len() as i64 * FIXTURE_TIMESTAMP_STEP_MS,
            },
        ));
    }

    operations.push(WorkspaceOperationEnvelope::v1(
        WorkspaceOperation::UpdateSettings {
            settings: fixture_settings(&name),
        },
    ));
    if !layout.note_parents.is_empty() {
        operations.push(WorkspaceOperationEnvelope::v1(
            WorkspaceOperation::SetActiveNote {
                note_id: Some(note_id(spec, 1)),
            },
        ));
    }

    let metadata = FixtureMetadata {
        name,
        shape: spec.shape,
        note_count: spec.note_count,
        folder_count: layout.folders.len(),
        node_count: layout.folders.len() + spec.note_count,
        document_count: spec.note_count,
        max_depth,
        operation_count: operations.len(),
        search_expectations: search_expectations(spec),
    };

    WorkspaceFixture {
        metadata,
        operations,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    use skriuw_domain::{NodeKind, NodePosition, WorkspaceOperation};

    use super::{
        FIXTURE_BASE_TIMESTAMP_MS, FIXTURE_SETTINGS_EXTENSION_KEY, FIXTURE_TIMESTAMP_STEP_MS,
        FixtureSpec, TreeShape, canonical_specs, fixture_digest, generate_workspace_fixture,
        unique_note_token,
    };

    fn structural_specs() -> Vec<FixtureSpec> {
        let mut specs = canonical_specs().to_vec();
        specs.extend([
            FixtureSpec {
                shape: TreeShape::Wide,
                note_count: 1,
            },
            FixtureSpec {
                shape: TreeShape::Nested,
                note_count: 17,
            },
            FixtureSpec {
                shape: TreeShape::Mixed,
                note_count: 123,
            },
        ]);
        specs
    }

    #[test]
    fn canonical_fixtures_are_deterministic() {
        for spec in canonical_specs() {
            let first = generate_workspace_fixture(spec);
            let second = generate_workspace_fixture(spec);
            assert_eq!(first, second, "{}", first.metadata.name);
            assert_eq!(
                fixture_digest(&first),
                fixture_digest(&second),
                "{}",
                first.metadata.name
            );
        }
    }

    #[test]
    fn canonical_operation_digests_are_pinned() {
        let expected = [
            (
                "wide-1000",
                "c4e6ca1b0392cf555fe758cd4b709ff956862661e4337cd26519fa836566481b",
            ),
            (
                "nested-1000",
                "1e84b7fd861ee6c70ca55e80aba1b2c3d9ec0dd1e3133074d974f0335d6f960f",
            ),
            (
                "mixed-1000",
                "a8be5c752487179431635a01ca989fbe866118251d836213453efd02bacb24b6",
            ),
            (
                "wide-5000",
                "697fff9952091873cb2f2d2b3fe487e53356e00ac6a763d6cc4980b2d7f1d844",
            ),
            (
                "nested-5000",
                "e41672a02c6102ab1fdd78d7f52c4dae9b840df8332fc4248e4e559d83ee543c",
            ),
            (
                "mixed-5000",
                "debfb699e59fc51495802fc31501b99345c9abf32fa59cf219ad7e33bfb53e61",
            ),
        ];
        for (spec, (name, digest)) in canonical_specs().into_iter().zip(expected) {
            let fixture = generate_workspace_fixture(spec);
            assert_eq!(fixture.metadata.name, name);
            assert_eq!(fixture_digest(&fixture), digest, "{name}");
        }
    }

    #[test]
    fn every_generated_operation_validates() {
        for spec in structural_specs() {
            let fixture = generate_workspace_fixture(spec);
            for envelope in &fixture.operations {
                envelope
                    .validate()
                    .unwrap_or_else(|error| panic!("{}: {error}", fixture.metadata.name));
            }
        }
    }

    #[test]
    fn metadata_matches_replayed_tree_structure() {
        for spec in structural_specs() {
            let fixture = generate_workspace_fixture(spec);
            let mut nodes = BTreeMap::<&str, (NodeKind, usize)>::new();
            let mut folder_count = 0usize;
            let mut note_count = 0usize;
            let mut max_depth = 0usize;

            for envelope in &fixture.operations {
                let (id, kind, placement) = match &envelope.operation {
                    WorkspaceOperation::CreateFolder { id, placement, .. } => {
                        (id, NodeKind::Folder, placement)
                    }
                    WorkspaceOperation::CreateNote { id, placement, .. } => {
                        (id, NodeKind::Note, placement)
                    }
                    _ => continue,
                };
                assert_eq!(placement.position, NodePosition::Last);
                let depth = match placement.parent_id.as_deref() {
                    None => 1,
                    Some(parent_id) => {
                        let (parent_kind, parent_depth) = nodes
                            .get(parent_id)
                            .unwrap_or_else(|| panic!("missing parent {parent_id}"));
                        assert_eq!(*parent_kind, NodeKind::Folder);
                        parent_depth + 1
                    }
                };
                assert!(
                    nodes.insert(id, (kind, depth)).is_none(),
                    "duplicate id {id}"
                );
                max_depth = max_depth.max(depth);
                match kind {
                    NodeKind::Folder => folder_count += 1,
                    NodeKind::Note => note_count += 1,
                }
            }

            let metadata = &fixture.metadata;
            assert_eq!(metadata.folder_count, folder_count, "{}", metadata.name);
            assert_eq!(metadata.note_count, note_count, "{}", metadata.name);
            assert_eq!(metadata.node_count, nodes.len(), "{}", metadata.name);
            assert_eq!(metadata.document_count, note_count, "{}", metadata.name);
            assert_eq!(metadata.max_depth, max_depth, "{}", metadata.name);
            assert_eq!(
                metadata.operation_count,
                fixture.operations.len(),
                "{}",
                metadata.name
            );
        }
    }

    #[test]
    fn search_expectations_match_note_markdown() {
        for spec in structural_specs() {
            let fixture = generate_workspace_fixture(spec);
            let mut token_note_counts = BTreeMap::<String, usize>::new();
            let mut unique_tokens = BTreeSet::new();
            for envelope in &fixture.operations {
                let WorkspaceOperation::CreateNote { markdown, .. } = &envelope.operation else {
                    continue;
                };
                let tokens = markdown
                    .split_whitespace()
                    .map(str::to_string)
                    .collect::<BTreeSet<_>>();
                for token in &tokens {
                    if token.starts_with("uniq") {
                        assert!(unique_tokens.insert(token.clone()), "duplicate {token}");
                    }
                    *token_note_counts.entry(token.clone()).or_default() += 1;
                }
            }

            assert_eq!(unique_tokens.len(), fixture.metadata.note_count);
            for expectation in &fixture.metadata.search_expectations {
                assert_eq!(
                    token_note_counts
                        .get(&expectation.term)
                        .copied()
                        .unwrap_or_default(),
                    expectation.expected_note_matches,
                    "{} {}",
                    fixture.metadata.name,
                    expectation.term
                );
            }
            assert_eq!(
                token_note_counts
                    .get(&unique_note_token(spec, 1))
                    .copied()
                    .unwrap_or_default(),
                usize::from(spec.note_count >= 1)
            );
        }
    }

    #[test]
    fn timestamps_and_settings_are_fixed() {
        for spec in structural_specs() {
            let fixture = generate_workspace_fixture(spec);
            let mut create_index = 0i64;
            let mut settings_seen = false;
            for envelope in &fixture.operations {
                match &envelope.operation {
                    WorkspaceOperation::CreateFolder { at, .. }
                    | WorkspaceOperation::CreateNote { at, .. } => {
                        assert_eq!(
                            *at,
                            FIXTURE_BASE_TIMESTAMP_MS + create_index * FIXTURE_TIMESTAMP_STEP_MS
                        );
                        create_index += 1;
                    }
                    WorkspaceOperation::UpdateSettings { settings } => {
                        settings_seen = true;
                        assert_eq!(
                            settings.extensions[FIXTURE_SETTINGS_EXTENSION_KEY],
                            serde_json::Value::String(fixture.metadata.name.clone())
                        );
                        settings.validate().expect("fixture settings validate");
                    }
                    WorkspaceOperation::SetActiveNote { note_id } => {
                        assert_eq!(note_id.as_deref(), Some(super::note_id(spec, 1).as_str()));
                    }
                    _ => panic!("unexpected fixture operation"),
                }
            }
            assert!(settings_seen);
        }
    }
}
