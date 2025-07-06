require 'digest'

module Jekyll
  class MermaidBlock < Liquid::Block
    def initialize(tag_name, markup, tokens)
      super
      @markup = markup.strip
    end

    def render(context)
      content = super
      site = context.registers[:site]
      
      # Generate unique ID for the diagram
      diagram_id = "mermaid-#{Digest::SHA1.hexdigest(content)[0..7]}"
      
      # Create the mermaid diagram HTML
      <<~HTML
        <div class="mermaid-diagram">
          <div id="#{diagram_id}" class="mermaid">
            #{content}
          </div>
        </div>
      HTML
    end
  end
end

Liquid::Template.register_tag('mermaid', Jekyll::MermaidBlock) 