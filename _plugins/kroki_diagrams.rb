require 'digest'
require 'base64'
require 'zlib'
require 'net/http'
require 'uri'

module Jekyll
  class KrokiBlock < Liquid::Block
    def initialize(tag_name, markup, tokens)
      super
      @diagram_type = markup.strip.downcase
      @diagram_type = 'plantuml' if @diagram_type.empty?
    end

    def render(context)
      content = super.strip
      site = context.registers[:site]
      
      # Generate unique ID for caching
      diagram_id = "kroki-#{@diagram_type}-#{Digest::SHA1.hexdigest(content)[0..7]}"
      
      # Encode content for Kroki
      encoded_content = encode_for_kroki(content)
      
      # Use Kroki server (reliable, handles encoding properly)
      kroki_url = "https://kroki.io/#{@diagram_type}/svg/#{encoded_content}"
      
      # Generate responsive diagram HTML
      <<~HTML
        <div class="diagram-container">
          <div id="#{diagram_id}" class="kroki-diagram">
            <img src="#{kroki_url}" 
                 alt="#{@diagram_type.capitalize} Diagram" 
                 loading="lazy" 
                 style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
          </div>
        </div>
      HTML
    end

    private

    def encode_for_kroki(text)
      # Kroki uses simple URL-safe base64 encoding (no complex schemes)
      compressed = Zlib::Deflate.deflate(text, 9)
      Base64.urlsafe_encode64(compressed).strip
    end
  end

  # Register tags for different diagram types
  class PlantUMLBlock < KrokiBlock
    def initialize(tag_name, markup, tokens)
      super(tag_name, 'plantuml', tokens)
    end
  end

  class GraphvizBlock < KrokiBlock
    def initialize(tag_name, markup, tokens)
      super(tag_name, 'graphviz', tokens)
    end
  end

  class SvgbobBlock < KrokiBlock
    def initialize(tag_name, markup, tokens)
      super(tag_name, 'svgbob', tokens)
    end
  end
end

# Register the tags
Liquid::Template.register_tag('plantuml', Jekyll::PlantUMLBlock)
Liquid::Template.register_tag('graphviz', Jekyll::GraphvizBlock)  
Liquid::Template.register_tag('svgbob', Jekyll::SvgbobBlock) 