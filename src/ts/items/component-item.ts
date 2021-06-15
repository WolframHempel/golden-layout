import { ResolvedComponentItemConfig, ResolvedHeaderedItemConfig } from '../config/resolved-config';
import { ComponentContainer } from '../container/component-container';
import { Tab } from '../controls/tab';
import { UnexpectedNullError } from '../errors/internal-error';
import { LayoutManager } from '../layout-manager';
import { DomConstants } from '../utils/dom-constants';
import { ItemType, JsonValue } from '../utils/types';
import { getElementWidthAndHeight, setElementHeight, setElementWidth, setElementDisplayVisibility, numberToPixels } from '../utils/utils';
import { ComponentParentableItem } from './component-parentable-item';
import { ContentItem } from './content-item';

/** @public */
export class ComponentItem extends ContentItem {
    /** @internal */
    private _reorderEnabled: boolean;
    /** @internal */
    private _headerConfig: ResolvedHeaderedItemConfig.Header | undefined;
    /** @internal */
    private _title: string;
    /** @internal */
    private readonly _initialWantMaximise: boolean;
    /** @internal */
    private _container: ComponentContainer;
    /** @internal */
    private _tab: Tab;
    /** @internal */
    private _focused = false;

    /** @internal @deprecated use {@link (ComponentItem:class).componentType} */
    get componentName(): JsonValue { return this._container.componentType; }
    get componentType(): JsonValue { return this._container.componentType; }
    get reorderEnabled(): boolean { return this._reorderEnabled; }
    /** @internal */
    get initialWantMaximise(): boolean { return this._initialWantMaximise; }
    get component(): ComponentItem.Component { return this._container.component; }
    get container(): ComponentContainer { return this._container; }
    get parentItem(): ComponentParentableItem { return this._parentItem; }

    get headerConfig(): ResolvedHeaderedItemConfig.Header | undefined { return this._headerConfig; }
    get title(): string { return this._title; }
    get tab(): Tab { return this._tab; }
    get focused(): boolean { return this._focused; }

    /** @internal */
    constructor(
        layoutManager: LayoutManager,
        config: ResolvedComponentItemConfig,
        /** @internal */
        private _parentItem: ComponentParentableItem
    ) {
        super(layoutManager, config, _parentItem, document.createElement('div'));

        this.isComponent = true;

        this._reorderEnabled = config.reorderEnabled;

        this.applyUpdatableConfig(config);

        this._initialWantMaximise = config.maximised;

        const parentElement = layoutManager.componentParent || this.element;
        let containerElement;
        if (layoutManager.createComponent) {
            containerElement = (layoutManager.createComponent)(this, parentElement, config);
        } else {
            containerElement = document.createElement('div');
            containerElement.classList.add(DomConstants.ClassName.Content);
            parentElement.appendChild(containerElement);
        }
        this._container = new ComponentContainer(config, this, layoutManager, containerElement,
            (itemConfig) => this.handleUpdateItemConfigEvent(itemConfig),
            () => this.show(),
            () => this.hide(),
            (suppressEvent) => this.focus(suppressEvent),
            (suppressEvent) => this.blur(suppressEvent),
        );
    }

    /** @internal */
    destroy(): void {
        this._container.destroy()
        super.destroy();
    }

    applyUpdatableConfig(config: ResolvedComponentItemConfig): void {
        this.setTitle(config.title);
        this._headerConfig = config.header;
    }

    toConfig(): ResolvedComponentItemConfig {
        const stateRequestEvent = this._container.stateRequestEvent;
        const state = stateRequestEvent === undefined ? this._container.state : stateRequestEvent();

        const result: ResolvedComponentItemConfig = {
            type: ItemType.component,
            content: [],
            width: this.width,
            minWidth: this.minWidth,
            height: this.height,
            minHeight: this.minHeight,
            id: this.id,
            maximised: false,
            isClosable: this.isClosable,
            reorderEnabled: this._reorderEnabled,
            title: this._title,
            header: ResolvedHeaderedItemConfig.Header.createCopy(this._headerConfig),
            componentType: ResolvedComponentItemConfig.copyComponentType(this.componentType),
            componentState: state,
        }

        return result;
    }

    close(): void {
        if (this.parent === null) {
            throw new UnexpectedNullError('CIC68883');
        } else {
            this.parent.removeChild(this, false);
        }
    }

    // Used by Drag Proxy
    /** @internal */
    setDragSize(width: number, height: number): void {
        setElementWidth(this.element, width);
        setElementHeight(this.element, height);
        this._container.setDragSize(width, height);
    }

    /** @internal */
    updateSize(): void {
        this.updateNodeSize();
        // ComponentItems do not have any ContentItems
    }

    /** @internal */
    init(): void {
        this.updateNodeSize();

        super.init();
        this._container.emit('open');
        this.initContentItems();
    }

    /**
     * Set this component's title
     *
     * @public
     * @param title -
     */

    setTitle(title: string): void {
        this._title = title;
        this.emit('titleChanged', title);
        this.emit('stateChanged');
    }

    setTab(tab: Tab): void {
        this._tab = tab;
        this.emit('tab', tab)
        this._container.setTab(tab);
    }

    /** @internal */
    hide(): void {
        this._container.checkEmitHide();
        if (this.container.element.parentNode != this.element)
            setElementDisplayVisibility(this.container.element, false);
        super.hide();
    }

    /** @internal */
    show(): void {
        this._container.checkEmitShow();
        if (this.container.element.parentNode != this.element)
            setElementDisplayVisibility(this.container.element, true);
        super.show();
    }

    /**
     * Focuses the item if it is not already focused
     */
    focus(suppressEvent = false): void {
        this.parentItem.setActiveComponentItem(this, true, suppressEvent);
    }

    /** @internal */
    setFocused(suppressEvent: boolean): void {
        this._focused = true;
        this.tab.setFocused();
        if (!suppressEvent) {
            this.emitBaseBubblingEvent('focus');
        }
    }

    /**
     * Blurs (defocuses) the item if it is focused
     */
    blur(suppressEvent = false): void {
        if (this._focused) {
            this.layoutManager.setFocusedComponentItem(undefined, suppressEvent);
        }
    }

    /** @internal */
    setBlurred(suppressEvent: boolean): void {
        this._focused = false;
        this.tab.setBlurred();
        if (!suppressEvent) {
            this.emitBaseBubblingEvent('blur');
        }
    }

    /** @internal */
    protected setParent(parent: ContentItem): void {
        this._parentItem = parent as ComponentParentableItem;
        super.setParent(parent);
    }

    /** @internal */
    private handleUpdateItemConfigEvent(itemConfig: ResolvedComponentItemConfig) {
        this.applyUpdatableConfig(itemConfig);
    }

    /** @internal */
    private updateNodeSize(): void {
        if (this.element.parentNode && this.element.style.display !== 'none') {
            // Do not update size of hidden components to prevent unwanted reflows
            const { width, height } = getElementWidthAndHeight(this.element);
            this._container.setSizeToNodeSize(width, height);
        }
    }
}

/** @public @deprecated use {@link (ComponentItem:class)} */
export type Component = ComponentItem;

/** @public */
export namespace ComponentItem {
    export type Component = unknown;
}
