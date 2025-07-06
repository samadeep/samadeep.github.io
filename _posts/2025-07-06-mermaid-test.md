---
layout: post
title: "Mermaid Test"
date: 2025-07-06 18:11:24 +0530
categories: ["Test"]
tags: ["mermaid", "test"]
author: Samadeep Sengupta
description: "Testing Mermaid diagram rendering functionality"
---

# Mermaid Test

This is a simple test post to verify Mermaid diagrams are working correctly.

## Simple Flowchart

{% mermaid %}
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Fix it]
    D --> B
    C --> E[End]
{% endmermaid %}

## Sequence Diagram

{% mermaid %}
sequenceDiagram
    participant User
    participant Browser
    participant Server
    
    User->>Browser: Visit blog
    Browser->>Server: Request page
    Server-->>Browser: Return HTML
    Browser->>Browser: Load Mermaid
    Browser->>User: Display diagram
{% endmermaid %}

## Simple Pie Chart

{% mermaid %}
pie title Blog Features
    "TOC" : 25
    "Progress Bar" : 20
    "Copy Buttons" : 15
    "Image Lightbox" : 15
    "Navigation" : 25
{% endmermaid %}

If you can see the diagrams above, Mermaid is working correctly!

---

*Have questions or feedback? Feel free to reach out on [Twitter](https://twitter.com/samadeepviews) or [LinkedIn](https://www.linkedin.com/in/samadeep)!*
