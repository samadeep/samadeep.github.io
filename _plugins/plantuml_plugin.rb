require 'digest'
require 'base64'
require 'zlib'

module Jekyll
  class PlantUMLBlock < Liquid::Block
    def initialize(tag_name, markup, tokens)
      super
      @markup = markup.strip
    end

    def render(context)
      content = super
      site = context.registers[:site]
      
      # Generate unique ID for the diagram
      diagram_id = "plantuml-#{Digest::SHA1.hexdigest(content)[0..7]}"
      
      # Encode content for PlantUML server
      encoded_content = encode_plantuml(content)
      
      # Create the PlantUML diagram HTML
      <<~HTML
        <div class="plantuml-diagram">
          <div id="#{diagram_id}" class="plantuml">
            <img src="https://www.plantuml.com/plantuml/svg/#{encoded_content}" 
                 alt="PlantUML Diagram" 
                 loading="lazy" 
                 style="max-width: 100%; height: auto;" />
          </div>
        </div>
      HTML
    end

    private

    def encode_plantuml(text)
      # Add @startuml and @enduml if not present
      unless text.include?('@startuml')
        text = "@startuml\n#{text}\n@enduml"
      end
      
      # Encode for PlantUML URL
      compressed = Zlib::Deflate.deflate(text, 9)
      Base64.strict_encode64(compressed).tr('+/', '-_').gsub(/=+$/, '')
    end
  end
end

Liquid::Template.register_tag('plantuml', Jekyll::PlantUMLBlock) 