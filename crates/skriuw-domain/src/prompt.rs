use std::collections::BTreeSet;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    MAX_AI_RESPONSE_BYTES, OperationValidationError, validate_id, validate_optional_id,
    validate_timestamp,
};

pub const BUILT_IN_PROMPT_LIBRARY_VERSION: u16 = 2;
pub const MAX_PROMPT_NAME_BYTES: usize = 80;
pub const MAX_PROMPT_SYSTEM_BYTES: usize = 8_000;
pub const MAX_PROMPT_TEMPERATURE_MILLIS: u16 = 1_000;

/// The material a prompt expects to be filled with. Prompts are
/// provider-agnostic, so this describes the caller's obligation rather than any
/// provider's message format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PromptInputShape {
    /// The user prompt carries the current editor selection.
    Selection,
    /// The user prompt carries the whole note.
    Note,
    /// The user prompt is whatever the caller types.
    Freeform,
}

impl PromptInputShape {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Selection => "selection",
            Self::Note => "note",
            Self::Freeform => "freeform",
        }
    }

    pub fn parse(value: &str) -> Result<Self, OperationValidationError> {
        match value {
            "selection" => Ok(Self::Selection),
            "note" => Ok(Self::Note),
            "freeform" => Ok(Self::Freeform),
            _ => Err(OperationValidationError::InvalidIdentifier {
                field: "prompt input shape",
            }),
        }
    }
}

/// The provider-neutral generation defaults a prompt ships with. They mirror
/// the completion seam's parameters so a prompt can be fired without a second
/// translation step, and they never carry a provider, model, or credential.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PromptParameters {
    pub temperature_millis: Option<u16>,
    pub max_output_bytes: u32,
}

impl PromptParameters {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        if self.max_output_bytes == 0
            || usize::try_from(self.max_output_bytes).unwrap_or(usize::MAX) > MAX_AI_RESPONSE_BYTES
        {
            return Err(OperationValidationError::TooLong {
                field: "prompt max output bytes",
                maximum: MAX_AI_RESPONSE_BYTES,
            });
        }
        if self
            .temperature_millis
            .is_some_and(|value| value > MAX_PROMPT_TEMPERATURE_MILLIS)
        {
            return Err(OperationValidationError::TooLong {
                field: "prompt temperature",
                maximum: MAX_PROMPT_TEMPERATURE_MILLIS as usize,
            });
        }
        Ok(())
    }
}

/// A prompt the application ships. Built-ins are code, not workspace data: they
/// never enter SQLite, sync, or an archive, so a shipped revision reaches every
/// device by updating the application.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInPrompt {
    pub id: &'static str,
    pub name: &'static str,
    pub system_prompt: &'static str,
    pub input_shape: PromptInputShape,
    pub parameters: PromptParameters,
}

/// The generated contract the renderer reads so both sides of the boundary
/// describe one library instead of two drifting copies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInPromptLibrary {
    pub version: u16,
    pub prompts: &'static [BuiltInPrompt],
}

impl BuiltInPromptLibrary {
    #[must_use]
    pub const fn current() -> Self {
        Self {
            version: BUILT_IN_PROMPT_LIBRARY_VERSION,
            prompts: BUILT_IN_PROMPTS,
        }
    }
}

const fn parameters(temperature_millis: u16, max_output_bytes: u32) -> PromptParameters {
    PromptParameters {
        temperature_millis: Some(temperature_millis),
        max_output_bytes,
    }
}

/// The single shipped source for the classic writing actions. Ordering is the
/// order these appear in every picker.
pub const BUILT_IN_PROMPTS: &[BuiltInPrompt] = &[
    BuiltInPrompt {
        id: "rewrite",
        name: "Rewrite",
        system_prompt: "You rewrite the writer's text. Keep the meaning, the language, and the level of detail, but choose different wording and sentence structure. Reply with the rewritten text only: no preamble, no commentary, no quotation marks around the result.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(600, 64 * 1024),
    },
    BuiltInPrompt {
        id: "improve",
        name: "Improve writing",
        system_prompt: "You improve the writer's text. Sharpen weak phrasing, cut padding, and fix awkward rhythm while keeping the author's voice, meaning, and language. Reply with the improved text only: no preamble, no commentary, no quotation marks around the result.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(500, 64 * 1024),
    },
    BuiltInPrompt {
        id: "fix-grammar",
        name: "Fix spelling and grammar",
        system_prompt: "You correct spelling, grammar, and punctuation in the writer's text. Change nothing else: keep the wording, tone, formatting, and language exactly as they are. Reply with the corrected text only: no preamble, no commentary, no list of the changes.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(100, 64 * 1024),
    },
    BuiltInPrompt {
        id: "shorten",
        name: "Make shorter",
        system_prompt: "You shorten the writer's text. Keep every point that carries meaning and drop what does not, aiming for roughly half the length. Keep the author's voice and language. Reply with the shortened text only: no preamble, no commentary.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(400, 64 * 1024),
    },
    BuiltInPrompt {
        id: "lengthen",
        name: "Make longer",
        system_prompt: "You expand the writer's text. Develop the existing points with detail, examples, and connective reasoning that follow from what is already there. Invent no facts. Keep the author's voice and language. Reply with the expanded text only: no preamble, no commentary.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(700, 128 * 1024),
    },
    BuiltInPrompt {
        id: "change-tone",
        name: "Change tone",
        system_prompt: "You restate the writer's text in the tone the writer asks for. If no tone is named, use a clear neutral professional tone. Keep the meaning, the facts, and the language. Reply with the restated text only: no preamble, no commentary.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(600, 64 * 1024),
    },
    BuiltInPrompt {
        id: "simplify",
        name: "Simplify",
        system_prompt: "You make the writer's text easier to read. Prefer short sentences and plain words, unpack jargon on first use, and keep every fact intact. Keep the language of the original. Reply with the simplified text only: no preamble, no commentary.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(400, 64 * 1024),
    },
    BuiltInPrompt {
        id: "translate",
        name: "Translate",
        system_prompt: "You translate the writer's text into the target language the writer names. If no language is named, translate into English. Preserve meaning, tone, formatting, and any markup. Leave names, code, and quoted identifiers untranslated. Reply with the translation only: no preamble, no commentary.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(300, 128 * 1024),
    },
    BuiltInPrompt {
        id: "summarize",
        name: "Summarize",
        system_prompt: "You summarize the writer's note. Give the essentials in a few sentences, or in short bullets when the note is a list of separate items. Use only what the note says. Keep the language of the note. Reply with the summary only: no preamble, no commentary.",
        input_shape: PromptInputShape::Note,
        parameters: parameters(300, 32 * 1024),
    },
    BuiltInPrompt {
        id: "title",
        name: "Suggest a title",
        system_prompt: "You title the writer's note. Reply with one title of at most eight words that names what the note is about. Keep the language of the note. Reply with the title only: no quotation marks, no trailing punctuation, no alternatives, no commentary.",
        input_shape: PromptInputShape::Note,
        parameters: parameters(300, 4 * 1024),
    },
    BuiltInPrompt {
        id: "outline",
        name: "Outline",
        system_prompt: "You turn the writer's note into an outline. Use nested Markdown bullets that follow the note's own structure and cover it completely without adding new material. Keep the language of the note. Reply with the outline only: no preamble, no commentary.",
        input_shape: PromptInputShape::Note,
        parameters: parameters(300, 64 * 1024),
    },
    BuiltInPrompt {
        id: "extract-tasks",
        name: "Extract tasks",
        system_prompt: "You list the actionable tasks the writer's note asks for. Reply with one task per line as a plain Markdown bullet starting with `- `, each a short imperative phrase. Use only work the note actually states; invent nothing and leave out anything already finished. Keep the language of the note. Reply with the list only: no preamble, no commentary, no numbering, no nesting.",
        input_shape: PromptInputShape::Note,
        parameters: parameters(200, 32 * 1024),
    },
    BuiltInPrompt {
        id: "suggest-tags",
        name: "Suggest tags",
        system_prompt: "You suggest topic tags for the writer's note. Reply with one tag per line as a plain Markdown bullet starting with `- `, at most eight lines, each tag one or two words joined by a hyphen. Use topics the note is actually about. Keep the language of the note. Reply with the list only: no preamble, no commentary, no leading `#`.",
        input_shape: PromptInputShape::Note,
        parameters: parameters(200, 4 * 1024),
    },
    BuiltInPrompt {
        id: "continue",
        name: "Continue writing",
        system_prompt: "You continue the writer's text from exactly where it stops. Match the voice, tense, formatting, and language, and pick up mid-sentence when the text ends mid-sentence. Reply with the continuation only: never repeat the text you were given, and add no preamble or commentary.",
        input_shape: PromptInputShape::Selection,
        parameters: parameters(800, 64 * 1024),
    },
    BuiltInPrompt {
        id: "custom",
        name: "Custom",
        system_prompt: "You are a careful writing assistant working inside a note-taking application. Follow the writer's instruction exactly. Reply with the requested text only: no preamble, no commentary, no explanation of what you did.",
        input_shape: PromptInputShape::Freeform,
        parameters: parameters(600, 128 * 1024),
    },
];

#[must_use]
pub fn built_in_prompt(id: &str) -> Option<&'static BuiltInPrompt> {
    BUILT_IN_PROMPTS.iter().find(|prompt| prompt.id == id)
}

/// A prompt the user owns. It is ordinary workspace data: canonical in SQLite,
/// replicated, exported, and archived alongside notes. A prompt carries no
/// provider, model, endpoint, or credential, so it is never a secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePrompt {
    pub id: String,
    pub name: String,
    pub system_prompt: String,
    pub input_shape: PromptInputShape,
    pub parameters: PromptParameters,
    /// The built-in this prompt shadows, if any. A shadow hides its built-in
    /// everywhere the library is listed and can be reset by deleting it, which
    /// is why a shipped built-in update can never overwrite a user edit.
    #[serde(default)]
    pub built_in_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl WorkspacePrompt {
    pub fn validate(&self) -> Result<(), OperationValidationError> {
        validate_id("prompt id", &self.id)?;
        validate_prompt_name(&self.name)?;
        validate_prompt_system(&self.system_prompt)?;
        self.parameters.validate()?;
        validate_optional_id("prompt built-in id", &self.built_in_id)?;
        validate_timestamp(self.created_at)?;
        validate_timestamp(self.updated_at)
    }
}

fn validate_prompt_name(name: &str) -> Result<(), OperationValidationError> {
    if name.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "prompt name",
        });
    }
    if name.len() > MAX_PROMPT_NAME_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "prompt name",
            maximum: MAX_PROMPT_NAME_BYTES,
        });
    }
    Ok(())
}

fn validate_prompt_system(system_prompt: &str) -> Result<(), OperationValidationError> {
    if system_prompt.trim().is_empty() {
        return Err(OperationValidationError::Empty {
            field: "prompt system prompt",
        });
    }
    if system_prompt.len() > MAX_PROMPT_SYSTEM_BYTES {
        return Err(OperationValidationError::TooLong {
            field: "prompt system prompt",
            maximum: MAX_PROMPT_SYSTEM_BYTES,
        });
    }
    Ok(())
}

/// Validate the stored prompt library. Every caller that materializes prompts —
/// snapshot reads and archive imports alike — runs this so a duplicate identity
/// or a second shadow of the same built-in fails loudly instead of rendering as
/// two prompts that silently disagree.
pub fn validate_workspace_prompts(
    prompts: &[WorkspacePrompt],
) -> Result<(), OperationValidationError> {
    let mut ids = BTreeSet::new();
    let mut shadowed = BTreeSet::new();
    for prompt in prompts {
        prompt.validate()?;
        if !ids.insert(prompt.id.as_str()) {
            return Err(OperationValidationError::Duplicate {
                field: "prompt",
                id: prompt.id.clone(),
            });
        }
        if let Some(built_in_id) = &prompt.built_in_id
            && !shadowed.insert(built_in_id.as_str())
        {
            return Err(OperationValidationError::Duplicate {
                field: "prompt built-in id",
                id: built_in_id.clone(),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::{
        BUILT_IN_PROMPTS, BuiltInPromptLibrary, MAX_PROMPT_NAME_BYTES, MAX_PROMPT_SYSTEM_BYTES,
        PromptInputShape, PromptParameters, WorkspacePrompt, built_in_prompt,
        validate_workspace_prompts,
    };
    use crate::OperationValidationError;

    fn prompt(id: &str, built_in_id: Option<&str>) -> WorkspacePrompt {
        WorkspacePrompt {
            id: id.into(),
            name: "My prompt".into(),
            system_prompt: "Do the thing.".into(),
            input_shape: PromptInputShape::Selection,
            parameters: PromptParameters {
                temperature_millis: Some(500),
                max_output_bytes: 4_096,
            },
            built_in_id: built_in_id.map(str::to_owned),
            created_at: 1,
            updated_at: 2,
        }
    }

    #[test]
    fn built_in_library_is_unique_bounded_and_addressable() {
        let mut ids = BTreeSet::new();
        for built_in in BUILT_IN_PROMPTS {
            assert!(
                ids.insert(built_in.id),
                "duplicate built-in {}",
                built_in.id
            );
            assert!(
                built_in
                    .id
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-'),
                "built-in {} is not a usable identifier",
                built_in.id
            );
            assert!(!built_in.name.trim().is_empty());
            assert!(built_in.name.len() <= MAX_PROMPT_NAME_BYTES);
            assert!(!built_in.system_prompt.trim().is_empty());
            assert!(built_in.system_prompt.len() <= MAX_PROMPT_SYSTEM_BYTES);
            built_in
                .parameters
                .validate()
                .unwrap_or_else(|error| panic!("built-in {} is invalid: {error}", built_in.id));
            assert_eq!(built_in_prompt(built_in.id), Some(built_in));
        }
        assert_eq!(built_in_prompt("not-a-prompt"), None);
        assert_eq!(BuiltInPromptLibrary::current().prompts.len(), ids.len());
    }

    #[test]
    fn built_in_library_covers_the_classic_actions() {
        let ids = BUILT_IN_PROMPTS
            .iter()
            .map(|built_in| built_in.id)
            .collect::<BTreeSet<_>>();
        for expected in [
            "rewrite",
            "improve",
            "fix-grammar",
            "shorten",
            "lengthen",
            "change-tone",
            "simplify",
            "translate",
            "summarize",
            "title",
            "outline",
            "extract-tasks",
            "suggest-tags",
            "continue",
            "custom",
        ] {
            assert!(ids.contains(expected), "missing built-in {expected}");
        }
    }

    #[test]
    fn input_shape_round_trips_through_its_stored_form() {
        for shape in [
            PromptInputShape::Selection,
            PromptInputShape::Note,
            PromptInputShape::Freeform,
        ] {
            assert_eq!(PromptInputShape::parse(shape.as_str()), Ok(shape));
        }
        assert!(PromptInputShape::parse("everything").is_err());
    }

    #[test]
    fn rejects_unbounded_and_empty_prompt_fields() {
        let mut empty_name = prompt("prompt-1", None);
        empty_name.name = "   ".into();
        assert_eq!(
            empty_name.validate(),
            Err(OperationValidationError::Empty {
                field: "prompt name"
            })
        );

        let mut long_system = prompt("prompt-1", None);
        long_system.system_prompt = "x".repeat(MAX_PROMPT_SYSTEM_BYTES + 1);
        assert_eq!(
            long_system.validate(),
            Err(OperationValidationError::TooLong {
                field: "prompt system prompt",
                maximum: MAX_PROMPT_SYSTEM_BYTES,
            })
        );

        let mut hot = prompt("prompt-1", None);
        hot.parameters.temperature_millis = Some(1_001);
        assert!(hot.validate().is_err());

        let mut unbounded = prompt("prompt-1", None);
        unbounded.parameters.max_output_bytes = 0;
        assert!(unbounded.validate().is_err());
    }

    #[test]
    fn a_built_in_can_be_shadowed_only_once() {
        assert!(
            validate_workspace_prompts(&[
                prompt("prompt-1", Some("rewrite")),
                prompt("prompt-2", Some("improve")),
                prompt("prompt-3", None),
            ])
            .is_ok()
        );
        assert_eq!(
            validate_workspace_prompts(&[
                prompt("prompt-1", Some("rewrite")),
                prompt("prompt-2", Some("rewrite")),
            ]),
            Err(OperationValidationError::Duplicate {
                field: "prompt built-in id",
                id: "rewrite".into(),
            })
        );
        assert_eq!(
            validate_workspace_prompts(&[prompt("prompt-1", None), prompt("prompt-1", None)]),
            Err(OperationValidationError::Duplicate {
                field: "prompt",
                id: "prompt-1".into(),
            })
        );
    }
}
