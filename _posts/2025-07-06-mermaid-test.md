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

## Complex Decision Tree (Similar to Fixed Diagram)

{% mermaid %}
graph TB
    A["Item i, Weight w, Value v"] --> B["Include Item i"]
    A --> C["Exclude Item i"]
    B --> D["Value = v + DP[W-w]"]
    C --> E["Value = DP[W]"]
    D --> F["Max(Include, Exclude)"]
    E --> F
    
    style A fill:#e1f5fe
    style B fill:#c8e6c9
    style C fill:#ffcdd2
    style F fill:#fff3e0
{% endmermaid %}

## State Transition Diagram

{% mermaid %}
graph TB
    A["Position i-1"] --> B["A[i-1] < A[i] && B[i-1] < B[i]"]
    A --> C["A[i-1] < B[i] && B[i-1] < A[i]"]
    
    B --> D["Case 1: Natural Order"]
    C --> E["Case 2: Cross Order"]
    
    D --> F1["not_swap[i] = not_swap[i-1]"]
    D --> F2["swap[i] = swap[i-1] + 1"]
    
    E --> G1["not_swap[i] = min(not_swap[i], swap[i-1])"]
    E --> G2["swap[i] = min(swap[i], not_swap[i-1] + 1)"]
    
    style B fill:#c8e6c9
    style C fill:#ffcdd2
    style D fill:#e1f5fe
    style E fill:#fff3e0
    style F1 fill:#f0f8ff
    style F2 fill:#f0f8ff
    style G1 fill:#fff8dc
    style G2 fill:#fff8dc
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

If you can see all the diagrams above, Mermaid is working correctly!

---

*Have questions or feedback? Feel free to reach out on [Twitter](https://twitter.com/samadeepviews) or [LinkedIn](https://www.linkedin.com/in/samadeep)!*
