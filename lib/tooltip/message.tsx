import * as url from 'url'
import React from 'react'
import marked from 'marked'

import { visitMessage, openExternally, openFile, applySolution, getActiveTextEditor, sortSolutions } from '../helpers'
import type TooltipDelegate from './delegate'
import type { Message, LinterMessage } from '../types'
import FixButton from './fix-button'

function findHref(el: Element | null | undefined): string | null {
  while (el && !el.classList.contains('linter-line')) {
    if (el instanceof HTMLAnchorElement) {
      return el.href
    }
    el = el.parentElement
  }
  return null
}

type Props = {
  message: Message
  delegate: TooltipDelegate
}

type State = {
  description?: string
  descriptionShow?: boolean
}

export default class MessageElement extends React.Component<Props, State> {
  state: State = {
    description: '',
    descriptionShow: false,
  }

  componentDidMount() {
    this.props.delegate.onShouldUpdate(() => {
      this.setState({})
    })
    this.props.delegate.onShouldExpand(() => {
      if (!this.state.descriptionShow) {
        this.toggleDescription()
      }
    })
    this.props.delegate.onShouldCollapse(() => {
      if (this.state.descriptionShow) {
        this.toggleDescription()
      }
    })
  }

  onFixClick(): void {
    const message = this.props.message
    const textEditor = getActiveTextEditor()
    if (textEditor !== null && message.version === 2 && message.solutions && message.solutions.length) {
      applySolution(textEditor, sortSolutions(message.solutions)[0])
    }
  }

  openFile(ev: React.MouseEvent) {
    if (!(ev.target instanceof HTMLElement)) {
      return
    }
    const href = findHref(ev.target)
    if (!href) {
      return
    }
    // parse the link. e.g. atom://linter?file=<path>&row=<number>&column=<number>
    const { protocol, hostname, query } = url.parse(href, true)
    if (protocol !== 'atom:' || hostname !== 'linter') {
      return
    }
    // TODO: based on the types query is never null
    if (!query || !query.file) {
      return
    } else {
      const { file, row, column } = query
      // TODO: will these be an array?
      openFile(
        /* file */ Array.isArray(file) ? file[0] : file,
        /* position */ {
          row: row ? parseInt(Array.isArray(row) ? row[0] : row, 10) : 0,
          column: column ? parseInt(Array.isArray(column) ? column[0] : column, 10) : 0,
        },
      )
    }
  }

  canBeFixed(message: LinterMessage): boolean {
    if (message.version === 2 && message.solutions && message.solutions.length) {
      return true
    }
    return false
  }

  toggleDescription(result: string | null | undefined = null) {
    const newStatus = !this.state.descriptionShow
    const description = this.state.description || this.props.message.description

    if (!newStatus && !result) {
      this.setState({ descriptionShow: false })
      return
    }
    if (typeof description === 'string' || result) {
      const descriptionToUse = marked(result || (description as string))
      this.setState({ descriptionShow: true, description: descriptionToUse })
    } else if (typeof description === 'function') {
      this.setState({ descriptionShow: true })
      if (this.descriptionLoading) {
        return
      }
      this.descriptionLoading = true
      new Promise(function (resolve) {
        resolve(description())
      })
        .then(response => {
          if (typeof response !== 'string') {
            throw new Error(`Expected result to be string, got: ${typeof response}`)
          }
          this.toggleDescription(response)
        })
        .catch(error => {
          console.log('[Linter] Error getting descriptions', error)
          this.descriptionLoading = false
          if (this.state.descriptionShow) {
            this.toggleDescription()
          }
        })
    } else {
      console.error('[Linter] Invalid description detected, expected string or function but got:', typeof description)
    }
  }

  descriptionLoading = false

  render() {
    const { message, delegate } = this.props

    return (
      <div className={`linter-message ${message.severity}`} onClick={this.openFile}>
        {message.description && (
          <a href="#" onClick={() => this.toggleDescription()}>
            <span className={`icon linter-icon icon-${this.state.descriptionShow ? 'chevron-down' : 'chevron-right'}`} />
          </a>
        )}
        <div className="linter-excerpt">
          {this.canBeFixed(message) && <FixButton onClick={() => this.onFixClick()} />}
          {delegate.showProviderName ? `${message.linterName}: ` : ''}
          {message.excerpt}
        </div>{' '}
        {message.reference && message.reference.file && (
          <a href="#" onClick={() => visitMessage(message, true)}>
            <span className="icon linter-icon icon-alignment-aligned-to" />
          </a>
        )}
        {message.url && (
          <a href="#" onClick={() => openExternally(message)}>
            <span className="icon linter-icon icon-link" />
          </a>
        )}
        {this.state.descriptionShow && (
          <div
            dangerouslySetInnerHTML={{
              __html: this.state.description || 'Loading...',
            }}
            className="linter-line"
          />
        )}
      </div>
    )
  }
}
