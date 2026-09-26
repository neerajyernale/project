import {
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AuthSession } from '@wms/core';

/**
 * `*wmsCan="'orders:create'"` renders only when the permission is granted (any-of for arrays).
 * UI convenience only — the API enforces the same permission.
 */
@Directive({ selector: '[wmsCan]' })
export class CanDirective implements OnInit, OnDestroy {
  private permission: string | string[] = [];
  private elseTemplate: TemplateRef<unknown> | null = null;
  private sub?: Subscription;
  private shown: boolean | null = null;

  constructor(
    private readonly tpl: TemplateRef<unknown>,
    private readonly vcr: ViewContainerRef,
    private readonly session: AuthSession,
  ) {}

  @Input() set wmsCan(p: string | string[]) {
    this.permission = p;
    this.render();
  }

  @Input() set wmsCanElse(tpl: TemplateRef<unknown> | null) {
    this.elseTemplate = tpl;
    this.shown = null;
    this.render();
  }

  ngOnInit(): void {
    this.sub = this.session.user$.subscribe(() => this.render());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private render(): void {
    const allowed = this.session.can(this.permission);
    if (allowed === this.shown) return;
    this.shown = allowed;
    this.vcr.clear();
    if (allowed) this.vcr.createEmbeddedView(this.tpl);
    else if (this.elseTemplate) this.vcr.createEmbeddedView(this.elseTemplate);
  }
}

/** Emits when a pointer-down or focus lands outside the host (for popovers and menus). */
@Directive({ selector: '[wmsClickOutside]' })
export class ClickOutsideDirective implements OnInit, OnDestroy {
  @Output() wmsClickOutside = new EventEmitter<void>();
  private readonly handler = (e: Event) => {
    if (!this.el.nativeElement.contains(e.target as Node)) this.wmsClickOutside.emit();
  };

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    document.addEventListener('pointerdown', this.handler, true);
    document.addEventListener('focusin', this.handler, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.handler, true);
    document.removeEventListener('focusin', this.handler, true);
  }
}

/** Moves focus to the host after it renders (dialogs' first field, search boxes). */
@Directive({ selector: '[wmsAutofocus]' })
export class AutofocusDirective implements OnInit {
  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    setTimeout(() => this.el.nativeElement.focus(), 30);
  }
}
