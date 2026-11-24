<script setup lang="ts">
import { computed, h, type FunctionalComponent, type VNode } from 'vue';
import { parseProse, type ProseInline } from '../../utils/proseMarkdown';

/**
 * One stored paragraph of a Cerita section. The body is limited Markdown (see
 * `utils/proseMarkdown.ts`): it is parsed into an AST and rendered with real elements. Nothing
 * here uses `v-html`, so a stored tag is shown as text.
 */
export interface SectionProseProps {
  body: string;
}

const props = defineProps<SectionProseProps>();

const blocks = computed(() => parseProse(props.body));

const LINK_CLASS =
  'underline underline-offset-4 hover:no-underline focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2';

/** Renders inline nodes as VNodes; text is passed as a string so Vue escapes it. */
function inlineVNodes(nodes: ProseInline[]): Array<VNode | string> {
  return nodes.map((node): VNode | string => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'strong':
        return h('strong', { class: 'font-semibold' }, inlineVNodes(node.children));
      case 'em':
        return h('em', inlineVNodes(node.children));
      case 'link':
        return h(
          'a',
          { href: node.href, rel: 'noopener noreferrer', class: LINK_CLASS },
          inlineVNodes(node.children),
        );
    }
  });
}

const InlineNodes: FunctionalComponent<{ nodes: ProseInline[] }> = (inlineProps) =>
  inlineVNodes(inlineProps.nodes);
InlineNodes.props = ['nodes'];
</script>

<template>
  <div
    class="max-w-prose space-y-3 text-base leading-relaxed text-brand-navy"
    data-test="section-prose"
  >
    <template v-for="(block, index) in blocks" :key="index">
      <p v-if="block.type === 'paragraph'" class="whitespace-pre-line">
        <InlineNodes :nodes="block.children" />
      </p>
      <ul v-else class="list-disc space-y-1 pl-6">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
          <InlineNodes :nodes="item" />
        </li>
      </ul>
    </template>
  </div>
</template>
