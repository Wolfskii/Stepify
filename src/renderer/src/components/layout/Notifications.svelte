<script lang="ts">
import { notifications, uiActions } from '../../stores/ui.store'
</script>

<div class="notifications">
  {#each $notifications as notif (notif.id)}
    <div class="notif notif--{notif.type}" role="alert">
      <span class="notif__message">{notif.message}</span>
      <button
        class="notif__close"
        aria-label="Dismiss"
        on:click={() => uiActions.dismissNotification(notif.id)}
      >
        ✕
      </button>
    </div>
  {/each}
</div>

<style>
  .notifications {
    position: fixed;
    bottom: var(--space-6);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    z-index: 1000;
    pointer-events: none;
  }

  .notif {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    pointer-events: all;
    min-width: 240px;
    max-width: 400px;
    animation: slide-up var(--duration-normal) var(--ease-out);
  }

  .notif--success { border-color: var(--color-success); }
  .notif--error   { border-color: var(--color-error); }
  .notif--warning { border-color: var(--color-warning); }
  .notif--info    { border-color: var(--color-accent); }

  .notif__message {
    flex: 1;
    font-size: 13px;
    color: var(--color-text-primary);
  }

  .notif__close {
    color: var(--color-text-muted);
    font-size: 12px;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
  }

  .notif__close:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-overlay);
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
