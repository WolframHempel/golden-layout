import { UnexpectedNullError } from '../errors/internal-error';
import { AbstractContentItem } from '../items/AbstractContentItem';
import { Stack } from '../items/Stack';
import { LayoutManager } from '../LayoutManager';
import { DragListener } from '../utils/DragListener';
import { EventEmitter } from '../utils/EventEmitter';
import { getJQueryOffset } from '../utils/jquery-legacy';
import { Side } from '../utils/types';
import {
    createTemplateHtmlElement,
    getElementWidthAndHeight,
    numberToPixels,
    stripTags
} from '../utils/utils';

const _template = '<div class="lm_dragProxy">' +
    '<div class="lm_header">' +
    '<ul class="lm_tabs">' +
    '<li class="lm_tab lm_active"><i class="lm_left"></i>' +
    '<span class="lm_title"></span>' +
    '<i class="lm_right"></i></li>' +
    '</ul>' +
    '</div>' +
    '<div class="lm_content"></div>' +
    '</div>';

/**
 * This class creates a temporary container
 * for the component whilst it is being dragged
 * and handles drag events
 *
 * @constructor
 * @private
 *
 * @param {Number} x              The initial x position
 * @param {Number} y              The initial y position
 * @param {DragListener} dragListener
 * @param {lm.LayoutManager} layoutManager
 * @param {AbstractContentItem} contentItem
 * @param {AbstractContentItem} originalParent
 */
export class DragProxy extends EventEmitter {
    private _area: AbstractContentItem.Area | null;
    private _lastValidArea: AbstractContentItem.Area | null;
    private _minX: number;
    private _minY: number;
    private _maxX: number;
    private _maxY: number;
    private _width: number;
    private _height: number;
    private _contentItemParent: AbstractContentItem;
    private _sided: boolean;
    private _childElementContainer: HTMLElement;
    private _element: HTMLElement;

    get element(): HTMLElement { return this._element; }

    constructor(x: number, y: number,
        private readonly _dragListener: DragListener,
        private readonly _layoutManager: LayoutManager,
        private readonly _contentItem: AbstractContentItem,
        private readonly _originalParent: AbstractContentItem) {

        super();

        this._area = null;
        this._lastValidArea = null;

        this._dragListener.on('drag', (offsetX, offsetY, event) => this.onDrag(offsetX, offsetY, event));
        this._dragListener.on('dragStop', () => this.onDrop());

        this._element = createTemplateHtmlElement(_template);
        if (this._originalParent instanceof Stack && this._originalParent.headerShow) {
            this._sided = this._originalParent.headerLeftRightSided;
            this._element.classList.add('lm_' + this._originalParent.headerSide);
            if ([Side.right, Side.bottom].indexOf(this._originalParent.headerSide) >= 0) {
                const contentElement = this._element.querySelector('.lm_content');
                if (contentElement === null) {
                    throw new UnexpectedNullError('DPCCE88824');
                } else {
                    const headerElement = this._element.querySelector('.lm_header');
                    if (headerElement === null) {
                        throw new UnexpectedNullError('DPCHE90025');
                    } else {
                        contentElement.insertAdjacentElement('afterend', headerElement);
                    }
                }
            }
        }
        this._element.style.left = numberToPixels(x);
        this._element.style.top = numberToPixels(y);
        const tabElement = this._element.querySelector('.lm_tab');
        if (tabElement === null) {
            throw new UnexpectedNullError('DPCTE33245');
        } else {
            tabElement.setAttribute('title', stripTags(this._contentItem.config.title));
            const titleElement = this._element.querySelector('.lm_title');
            if (titleElement === null) {
                throw new UnexpectedNullError('DPCTI98826');
            } else {
                titleElement.insertAdjacentText('afterbegin', this._contentItem.config.title);
                const childElementContainer = this._element.querySelector('.lm_content') as HTMLElement;
                if (childElementContainer === null) {

                } else {
                    this._childElementContainer = childElementContainer;
                    this._childElementContainer.appendChild(this._contentItem.element);

                    this._undisplayTree();
                    this._layoutManager.calculateItemAreas();
                    this.setDimensions();

                    document.body.appendChild(this._element);

                    const offset = getJQueryOffset(this._layoutManager.container);

                    this._minX = offset.left;
                    this._minY = offset.top;
                    const { width: containerWidth, height: containerHeight } = getElementWidthAndHeight(this._layoutManager.container);
                    this._maxX = containerWidth + this._minX;
                    this._maxY = containerHeight + this._minY;
                    const { width: elementWidth, height: elementHeight } = getElementWidthAndHeight(this._element);
                    this._width = elementWidth;
                    this._height = elementHeight;

                    this._setDropPosition(x, y);
                }
            }
        }
    }

    /**
     * Callback on every mouseMove event during a drag. Determines if the drag is
     * still within the valid drag area and calls the layoutManager to highlight the
     * current drop area
     *
     * @param   offsetX The difference from the original x position in px
     * @param   offsetY The difference from the original y position in px
     * @param   event
     */
    private onDrag(offsetX: number, offsetY: number, event: EventEmitter.DragEvent) {

        const x = event.pageX;
        const y = event.pageY;
        const isWithinContainer = x > this._minX && x < this._maxX && y > this._minY && y < this._maxY;

        if (!isWithinContainer && this._layoutManager.config.settings?.constrainDragToContainer === true) {
            return;
        }

        this._setDropPosition(x, y);
    }

    /**
     * Sets the target position, highlighting the appropriate area
     *
     * @param   {Number} x The x position in px
     * @param   {Number} y The y position in px
     *
     * @returns {void}
     */
    _setDropPosition(x: number, y: number): void {
        this._element.style.left = numberToPixels(x);
        this._element.style.top = numberToPixels(y);
        this._area = this._layoutManager.getArea(x, y);

        if (this._area !== null) {
            this._lastValidArea = this._area;
            this._area.contentItem._$highlightDropZone(x, y, this._area);
        }
    }

    /**
     * Callback when the drag has finished. Determines the drop area
     * and adds the child to it
     */
    onDrop(): void {
        this.updateTree()
        const dropTargetIndicator = this._layoutManager.dropTargetIndicator;
        if (dropTargetIndicator === null) {
            throw new UnexpectedNullError('DPOD30011');
        } else {
            dropTargetIndicator.hide();
        }

        /*
         * Valid drop area found
         */
        if (this._area !== null) {
            this._area.contentItem._$onDrop(this._contentItem, this._area);

            /**
             * No valid drop area available at present, but one has been found before.
             * Use it
             */
        } else if (this._lastValidArea !== null) {
            this._lastValidArea.contentItem._$onDrop(this._contentItem, this._lastValidArea);

            /**
             * No valid drop area found during the duration of the drag. Return
             * content item to its original position if a original parent is provided.
             * (Which is not the case if the drag had been initiated by createDragSource)
             */
        } else if (this._originalParent) {
            this._originalParent.addChild(this._contentItem);

            /**
             * The drag didn't ultimately end up with adding the content item to
             * any container. In order to ensure clean up happens, destroy the
             * content item.
             */
        } else {
            this._contentItem._$destroy(); // contentItem children are now destroyed as well
        }

        this._element.remove();

        this._layoutManager.emit('itemDropped', this._contentItem);
    }

    /**
     * Undisplays the item from its original position within the tree
     */
    private _undisplayTree() {

        /**
         * parent is null if the drag had been initiated by a external drag source
         */
        if (this._contentItem.parent !== null) {
            this._contentItem.parent.undisplayChild(this._contentItem);
        }
    }

    /**
     * Removes the item from its original position within the tree
     */
    private updateTree() {
        // Parent is NO LONGER null if the drag had been initiated by a external drag source
        // If an external drag source initiated drag, then dummy parent will be used.  In this case
        // still remove child from (dummy) parent
        // if (this._contentItem.parent !== null) {
        //     this._contentItem.parent.removeChild(this._contentItem, true);
        // }

        this._contentItem.setParent(this._contentItemParent);
    }

    /**
     * Updates the Drag Proxie's dimensions
     */
    private setDimensions() {
        const dimensions = this._layoutManager.config.dimensions;
        if (dimensions === undefined) {
            throw new Error('DragProxy.setDimensions: dimensions undefined');
        } else {
            let width = dimensions.dragProxyWidth;
            let height = dimensions.dragProxyHeight;
            if (width === undefined || height === undefined) {
                throw new Error('DragProxy.setDimensions: width and/or height undefined');
            } else {
                this._element.style.width = numberToPixels(width);
                this._element.style.height = numberToPixels(height)
                width -= (this._sided ? dimensions.headerHeight : 0);
                height -= (!this._sided ? dimensions.headerHeight : 0);
                this._childElementContainer.style.width = numberToPixels(width);
                this._childElementContainer.style.height = numberToPixels(height);
                this._contentItem.element.style.width = numberToPixels(width);
                this._contentItem.element.style.height = numberToPixels(height);
                this._contentItem._$show();
                this._contentItem.updateSize();
            }
        }
    }
}