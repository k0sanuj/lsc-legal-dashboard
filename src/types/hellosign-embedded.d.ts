declare module "hellosign-embedded" {
  type EventName =
    | "cancel"
    | "close"
    | "createTemplate"
    | "decline"
    | "error"
    | "finish"
    | "message"
    | "open"
    | "ready"
    | "reassign"
    | "send"
    | "sign"

  interface HelloSignOptions {
    allowCancel?: boolean
    clientId?: string
    container?: HTMLElement
    debug?: boolean
    hideHeader?: boolean
    locale?: string
    redirectTo?: string
    requestingEmail?: string
    skipDomainVerification?: boolean
    testMode?: boolean
    timeout?: number
    whiteLabeling?: Record<string, unknown>
  }

  export default class HelloSign {
    constructor(options: HelloSignOptions)
    open(url: string, options?: HelloSignOptions): void
    close(): void
    on(eventName: EventName, handler: (payload?: unknown) => void): this
    off(eventName: EventName, handler?: (payload?: unknown) => void): this
  }
}
