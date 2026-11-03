import type Anthropic from '@anthropic-ai/sdk';
import type { FunctionDeclaration } from '@google/genai';
import { z } from 'zod';
import { TOOLS } from '../tools/registry';

/** JSON Schema of each tool, generated from the same zod schemas that validate the calls. */
const schemas = () =>
  TOOLS.map((t) => {
    const { $schema: _ignored, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    return { name: t.name, description: t.description, schema };
  });

/** Gemini function declarations. */
export function functionDeclarations(): FunctionDeclaration[] {
  return schemas().map(({ name, description, schema }) => ({ name, description, parametersJsonSchema: schema }));
}

/**
 * Claude tool definitions (native tool use). eager_input_streaming stays off on purpose: inputs are a few short
 * fields, so there is nothing to stream early, and buffered mode keeps the API's own JSON validation.
 */
export function claudeTools(): Anthropic.Tool[] {
  return schemas().map(({ name, description, schema }) => ({ name, description, input_schema: { ...schema, type: 'object' } }));
}
