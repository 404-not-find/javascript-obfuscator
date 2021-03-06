import { inject, injectable, } from 'inversify';
import { ServiceIdentifiers } from '../../container/ServiceIdentifiers';

import * as ESTree from 'estree';
import * as estraverse from "estraverse";

import { IOptions } from '../../interfaces/options/IOptions';
import { IRandomGenerator } from '../../interfaces/utils/IRandomGenerator';
import { IVisitor } from '../../interfaces/node-transformers/IVisitor';

import { TransformationStage } from '../../enums/node-transformers/TransformationStage';

import { AbstractNodeTransformer } from '../AbstractNodeTransformer';
import { NodeGuards } from '../../node/NodeGuards';
import { ConditionalCommentObfuscatingGuard } from "./obfuscating-guards/ConditionalCommentObfuscatingGuard";

@injectable()
export class CommentsTransformer extends AbstractNodeTransformer {
    /**
     * @type {string[]}
     */
    private static readonly preservedWords: string[] = [
        '@license',
        '@preserve'
    ];

    /**
     * @param {IRandomGenerator} randomGenerator
     * @param {IOptions} options
     */
    constructor (
        @inject(ServiceIdentifiers.IRandomGenerator) randomGenerator: IRandomGenerator,
        @inject(ServiceIdentifiers.IOptions) options: IOptions
    ) {
        super(randomGenerator, options);
    }

    /**
     * @param {TransformationStage} transformationStage
     * @returns {IVisitor | null}
     */
    public getVisitor (transformationStage: TransformationStage): IVisitor | null {
        switch (transformationStage) {
            case TransformationStage.Initializing:
                return {
                    leave: (node: ESTree.Node) => {
                        if (NodeGuards.isProgramNode(node)) {
                            return this.transformNode(node);
                        }
                    }
                };

            default:
                return null;
        }
    }

    /**
     * Removes all comments from node except comments that contain
     * `@license`, `@preserve` or `javascript-obfuscator` words
     * Move comments to their nodes
     *
     * @param {Node} rootNode
     * @returns {NodeGuards}
     */
    public transformNode (rootNode: ESTree.Program): ESTree.Node {
        if (!rootNode.comments || !rootNode.comments.length) {
            return rootNode;
        }

        const comments: ESTree.Comment[] = this.transformComments(rootNode.comments);

        if (comments.length === 0) {
            return rootNode;
        }

        if (!rootNode.body.length) {
            rootNode.leadingComments = comments;

            return rootNode;
        }

        estraverse.traverse(rootNode, {
            enter: (node: ESTree.Node): void => {
                if (node === rootNode) {
                    return;
                }

                const commentIdx: number = comments.findIndex((comment: ESTree.Comment) =>
                    comment.range && node.range && comment.range[0] < node.range[0]
                );

                if (commentIdx === -1) {
                    return;
                }

                node.leadingComments = comments.splice(commentIdx, comments.length - commentIdx).reverse();
            }
        });

        if (comments.length > 0) {
            rootNode.trailingComments = comments.reverse();
        }

        return rootNode;
    }

    /**
     * @param {Comment[]} comments
     * @returns {Comment[]}
     */
    private transformComments (comments: ESTree.Comment[]): ESTree.Comment[] {
        return comments.filter((comment: ESTree.Comment) =>
            CommentsTransformer.preservedWords
                .some((preservedWord: string) => comment.value.includes(preservedWord)) ||
            ConditionalCommentObfuscatingGuard.isConditionalComment(comment)
        ).reverse();
    }
}
